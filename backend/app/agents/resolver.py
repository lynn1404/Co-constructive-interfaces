from typing import Optional, List, Tuple

from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

from app.schemas import GraphState, ResolverOutput, RelationMatch
from app.prompts import RESOLVER_SYSTEM_PROMPT, RELATION_MATCH_SYSTEM_PROMPT
from app.utils.graph_parser import _norm, extract_edges, _edge_key, _add_node, _match_node
from app.utils.timing import log_timing, logger

SETTLED_STATUSES = ("triplet_exists", "already_drawn", "echoes_candidate")


def _edges_between(known_edges: List[dict], subject: str, object_: str) -> List[dict]:
    """Existing edges connecting these two nodes, in EITHER direction.

    This is the gate that makes the relation question safe to ask. An earlier version put the
    relation judgment in the same call as node resolution, and the model returned already_exists=True
    for an edge sharing only ONE node with the proposal - telling students an edge was already drawn
    when it was not. Establishing the node pair in Python first means the model is only ever shown
    edges that genuinely connect the proposal's own two concepts, so that failure cannot recur.
    Both directions are returned because converse phrasing is a real duplicate.
    """
    s, o = _norm(subject), _norm(object_)
    return [
        e for e in known_edges
        if {_norm(e["subject"]), _norm(e["object"])} == {s, o}
    ]


@log_timing
def resolver_node(state: GraphState) -> dict:
    """Resolve each target triplet against what is already on the student's canvas.

    TWO STEPS, IN ORDER, WITH PYTHON BETWEEN THEM:
      1. Node resolution (model): does the subject already exist? the object?
      2. Only if BOTH resolve onto existing labels AND Python finds an edge connecting those two
         nodes, ask the model whether that edge states the same relation.
    When no edge connects the pair, step 2 is skipped entirely - no call, and no opportunity to
    invent a match.

    THE CANVAS IS NOT THE SAME AS `existing_graph`. The candidate the student just drew is on
    screen but not committed, so it is treated as present:

    - "correct": the candidate is the student's own edge -> `already_drawn`.
    - "incorrect": their edge is being replaced, so its nodes are NOT seeded. A "fix" identical to
      the rejected candidate is a defect, flagged `echoes_candidate` so the student is never told
      to redraw the edge just rejected.
    """
    status = state["evaluation_status"]

    if status == "redundant":
        return {
            "resolutions": None,
            "suggested_triplet": None,
            "action_hint": ["No action needed: fact is already fully represented in the existing graph."],
        }

    if state.get("evaluation_error_type") == "not_in_text":
        return {"resolutions": [], "suggested_triplet": [], "action_hint": []}
    
    # An empty list is a real answer ("nothing to add"), not a missing value. Only fall back to the
    # candidate when the corrector never ran at all - otherwise a no-fix outcome would silently
    # resolve the flagged triplet the student was just told was wrong.
    correction = state.get("correction")
    if status == "correct" or correction is None:
        target_triplets = [state["current_triplet"]]
    elif not correction:
        return {"resolutions": [], "suggested_triplet": [], "action_hint": []}
    else:
        target_triplets = correction

    # Only incomplete/incorrect can produce a fix reproducing an existing edge. A "correct"
    # candidate was already confirmed non-redundant by the evaluator.
    check_triplet_exists = status in ("incomplete", "incorrect")

    candidate = state["current_triplet"]
    candidate_key = _edge_key(candidate)

    def entry(triplet, status_, subj_res=None, obj_res=None, trip_res=None, hint=""):
        return {
            "triplet": triplet,
            "status": status_,
            "triplet_resolution": trip_res,
            "subject_resolution": subj_res,
            "object_resolution": obj_res,
            "action_hint": hint,
        }

    def candidate_entry(triplet):
        """Resolution for a target triplet that IS the candidate the student just drew."""
        if status == "incorrect":
            return entry(
                triplet, "echoes_candidate",
                hint="No change: this repeats the connection that was just flagged, so there is "
                     "nothing new to draw.",
            )
        return entry(
            triplet, "already_drawn",
            hint="Already drawn: this is the connection you just made. Nothing to add.",
        )

    # --- seed from the canvas, not just the committed graph ---
    known_nodes = list(state["existing_nodes"])
    known_edges = [
        {"subject": s, "predicate": p, "object": o}
        for (s, p, o) in extract_edges(state["existing_graph"])
    ]
    if status == "incomplete":
        if not any(_edge_key(e) == candidate_key for e in known_edges):
            known_edges.append(dict(candidate))
        _add_node(known_nodes, candidate["subject"])
        _add_node(known_nodes, candidate["object"])

    # Nothing to match against at all: every triplet is new, no API calls needed.
    if not known_nodes:
        resolutions = []
        for t in target_triplets:
            if _edge_key(t) == candidate_key:
                resolutions.append(candidate_entry(t))
            else:
                resolutions.append(entry(
                    t, "new",
                    hint="Create new subject node, object node, and connecting relation edge.",
                ))
        return {
            "resolutions": resolutions,
            "suggested_triplet": [r["triplet"] for r in resolutions if r["status"] not in SETTLED_STATUSES],
            "action_hint": [r["action_hint"] for r in resolutions],
        }

    # Both agents are built lazily: a chain resolving entirely in Python never needs a model, so it
    # should not construct a client or require a key. This is what lets the resolver be tested offline.
    _node_agent = None
    _relation_agent = None

    def node_agent():
        nonlocal _node_agent
        if _node_agent is None:
            _node_agent = ChatOpenAI(model="gpt-4o-mini", temperature=0).with_structured_output(ResolverOutput)
        return _node_agent

    def relation_agent():
        nonlocal _relation_agent
        if _relation_agent is None:
            _relation_agent = ChatOpenAI(model="gpt-4o-mini", temperature=0).with_structured_output(RelationMatch)
        return _relation_agent

    node_prompt = ChatPromptTemplate.from_messages([
        ("system", RESOLVER_SYSTEM_PROMPT),
        ("human",
         "Source Text: {text}\n"
         "Existing Node Labels: {nodes}\n"
         "Proposed Triplet: ({subject}, {predicate}, {object})\n\n"
         "Does the subject already exist as a node? Does the object?")
    ])

    relation_prompt = ChatPromptTemplate.from_messages([
        ("system", RELATION_MATCH_SYSTEM_PROMPT),
        ("human",
         "Source Text: {text}\n"
         "Proposed Triplet: ({subject}, {predicate}, {object})\n"
         "Existing edges connecting these SAME TWO nodes:\n{edges}\n\n"
         "Does any of them state the same relation as the proposal?")
    ])

    resolutions = []

    for target_triplet in target_triplets:
        # --- 0a. is this the student's own candidate? no API call ---
        if _edge_key(target_triplet) == candidate_key:
            resolutions.append(candidate_entry(target_triplet))
            _add_node(known_nodes, target_triplet["subject"])
            _add_node(known_nodes, target_triplet["object"])
            if not any(_edge_key(target_triplet) == _edge_key(e) for e in known_edges):
                known_edges.append(dict(target_triplet))
            continue

        # --- 0b. verbatim duplicate already on the canvas? plain Python ---
        if check_triplet_exists:
            exact_match = next(
                (e for e in known_edges if _edge_key(e) == _edge_key(target_triplet)), None
            )
            if exact_match is not None:
                resolutions.append(entry(
                    target_triplet, "triplet_exists",
                    hint=f"Already present: your map already states this exactly as "
                         f"'{exact_match['subject']} {exact_match['predicate']} {exact_match['object']}'. "
                         f"Nothing to draw.",
                ))
                _add_node(known_nodes, target_triplet["subject"])
                _add_node(known_nodes, target_triplet["object"])
                continue

        # --- 1. NODE RESOLUTION (model call) ---
        node_result = node_agent().invoke(node_prompt.format_prompt(
            text=state["source_text"],
            nodes=known_nodes,
            subject=target_triplet["subject"],
            predicate=target_triplet["predicate"],
            object=target_triplet["object"],
        ))

        subj_res = node_result.subject_resolution.model_dump()
        obj_res = node_result.object_resolution.model_dump()

        canonical_subject = (
            node_result.subject_resolution.canonical_node.strip()
            if node_result.subject_resolution.is_exact_match and node_result.subject_resolution.canonical_node
            else target_triplet["subject"]
        )
        canonical_object = (
            node_result.object_resolution.canonical_node.strip()
            if node_result.object_resolution.is_exact_match and node_result.object_resolution.canonical_node
            else target_triplet["object"]
        )
        suggested = {
            "subject": canonical_subject,
            "predicate": target_triplet["predicate"],
            "object": canonical_object,
        }

        subj_existing = _match_node(canonical_subject, known_nodes)
        obj_existing = _match_node(canonical_object, known_nodes)

        # Canonicalising can turn the proposal into one that already exists verbatim (both labels
        # resolved onto existing nodes, same predicate). Re-check in Python before asking anything.
        if check_triplet_exists:
            exact_match = next(
                (e for e in known_edges if _edge_key(e) == _edge_key(suggested)), None
            )
            if exact_match is not None:
                resolutions.append(entry(
                    suggested, "triplet_exists", subj_res, obj_res, None,
                    hint=f"Already present: your map already states this exactly as "
                         f"'{exact_match['subject']} {exact_match['predicate']} {exact_match['object']}'. "
                         f"Nothing to draw.",
                ))
                _add_node(known_nodes, canonical_subject)
                _add_node(known_nodes, canonical_object)
                continue

        # --- 2. RELATION MATCH (model call), gated: both nodes must exist AND an edge must
        #        already connect them. Otherwise there is nothing that could be a duplicate.
        trip_res = None
        if check_triplet_exists and subj_existing and obj_existing:
            candidates = _edges_between(known_edges, canonical_subject, canonical_object)
            if candidates:
                edge_lines = "\n".join(
                    f"- ({e['subject']}, {e['predicate']}, {e['object']})"
                    + ("   [the connection the student just drew]" if _edge_key(e) == candidate_key else "")
                    for e in candidates
                )
                rel_result = relation_agent().invoke(relation_prompt.format_prompt(
                    text=state["source_text"],
                    subject=canonical_subject,
                    predicate=target_triplet["predicate"],
                    object=canonical_object,
                    edges=edge_lines,
                ))
                trip_res = rel_result.model_dump()

                if rel_result.already_exists:
                    match = rel_result.matching_edge
                    # The model may only name an edge from the list it was given; anything else is
                    # discarded rather than shown to the student as an existing connection.
                    valid = match and any(_edge_key(match.model_dump()) == _edge_key(e) for e in candidates)
                    if valid:
                        as_drawn = f"'{match.subject} {match.predicate} {match.object}'"
                        resolutions.append(entry(
                            suggested, "triplet_exists", subj_res, obj_res, trip_res,
                            f"Already present: your map already states this as {as_drawn}. Nothing to draw.",
                        ))
                        _add_node(known_nodes, canonical_subject)
                        _add_node(known_nodes, canonical_object)
                        if not any(_edge_key(suggested) == _edge_key(e) for e in known_edges):
                            known_edges.append(suggested)
                        continue
                    logger.info(
                        "resolver: already_exists=True but matching_edge was not one of the candidate "
                        "edges - ignoring the match and treating the relation as new"
                    )

        # --- 3. report which nodes exist ---
        if subj_existing and obj_existing:
            status_ = "both_nodes_exist"
            hint = (f"Connect existing nodes: both '{subj_existing}' and '{obj_existing}' exist. "
                    f"Create only a new relation '{target_triplet['predicate']}' between them.")
        elif subj_existing:
            status_ = "subject_exists"
            hint = (f"Connect to existing subject: node '{subj_existing}' exists. "
                    f"Create new node '{canonical_object}' and relation '{target_triplet['predicate']}'.")
        elif obj_existing:
            status_ = "object_exists"
            hint = (f"Connect to existing object: node '{obj_existing}' exists. "
                    f"Create new node '{canonical_subject}' and relation '{target_triplet['predicate']}'.")
        else:
            status_ = "new"
            hint = "Create new subject node, object node, and connecting relation edge."

        resolutions.append(entry(suggested, status_, subj_res, obj_res, trip_res, hint))
        _add_node(known_nodes, canonical_subject)
        _add_node(known_nodes, canonical_object)
        known_edges.append(suggested)

    return {
        "resolutions": resolutions,
        "suggested_triplet": [r["triplet"] for r in resolutions if r["status"] not in SETTLED_STATUSES],
        "action_hint": [r["action_hint"] for r in resolutions],
    }