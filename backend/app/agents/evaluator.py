from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from app.schemas import GraphState
from app.utils.graph_parser import format_existing_graph
from app.utils.graph_parser import find_exact_duplicate, build_candidate_context
from app.utils.timing import log_timing, logger
from app.schemas import GraphState, TextJudgmentOutput, GraphJudgmentOutput
from app.prompts import TEXT_JUDGMENT_SYSTEM_PROMPT, GRAPH_JUDGMENT_SYSTEM_PROMPT
from app.utils.graph_parser import find_exact_duplicate, build_candidate_context
from typing import Optional
llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)


def derive_status(text: TextJudgmentOutput,
                  graph: GraphJudgmentOutput | None,
                  graph_type: str) -> str:
    """Combine the text judgment and the graph judgment into the four-value status.

    All precedence lives here, in Python, rather than being arbitrated by a model:

      1. Text doesn't support it        -> incorrect
      2. Text names a mediator the graph doesn't cover -> incorrect (Rule 3, and its exception
         is now a plain boolean AND rather than a prose caveat the model has to remember)
      3. A verified edge already states it -> redundant (structurally impossible without edges,
         so gated on graph_type)
      4. Sentence continues and nothing covers it -> incomplete
      5. otherwise -> correct

    Unfaithfulness outranks duplication: a student re-adding an edge that was itself wrong should
    be told about the error, not the repetition.
    """
    if not text.is_supported:
        return "incorrect"

    # graph is None when call 2 was skipped (nothing to compare against)
    if graph is None:
        if text.mediator_in_text:
            return "incorrect"

    if text.mediator_in_text and not graph.mediator_is_covered:
        return "incorrect"
    if graph_type == "full_triplets" and graph.duplicate_of is not None:
        return "redundant"
    return "correct"

def derive_error_type(text: TextJudgmentOutput,
                      graph: GraphJudgmentOutput | None,
                      status: str) -> Optional[str]:
    """The error taxonomy, derived from the same signals as the status.

    Null when correct. The five text-side labels come from the model - it alone knows WHERE the
    text and the candidate diverge, and it writes error_locus before choosing one. The structural
    labels are decided here, because each depends on combining a text finding with a graph finding
    that neither call can see on its own.

    Full taxonomy: null | not_in_text | reversed_relation | wrong_object | wrong_subject |
    wrong_predicate | skipped_mediator | unfinished_process | duplicate
    """
    if status == "correct":
        return None
    if status == "redundant":
        return "duplicate"
    if status == "incomplete":
        return "unfinished_process"

    # incorrect: either the text does not support it, or it does but skips a mediator the graph
    # has not covered. derive_status produces no other route to 'incorrect'.
    if not text.is_supported:
        if text.text_error is None:
            logger.info("derive_error_type: is_supported=False with no text_error label")
        return text.text_error
    if text.mediator_in_text:
        return "skipped_mediator"

    logger.info(
        "derive_error_type: status 'incorrect' but the text supports the triplet and no mediator "
        "was named - the status and the text judgment disagree"
    )
    return None

@log_timing
def evaluator_node(state: GraphState) -> dict:
    """Two calls, deliberately separated.

    CALL 1 sees the source text and the candidate - and NOT the graph.

    CALL 2 sees the graph and the candidate, plus the two findings call 1 produced (the mediator the
    text names, the continuation the sentence names) so it can check whether the graph covers them.
    It never re-judges faithfulness.

    derive_status combines them in Python. Call 2 is skipped entirely when call 1 says the text does
    not support the triplet (the status is 'incorrect' regardless) or when there are no verified
    edges to compare against - so an unsupported edge costs one call, not two.
    """
    graph_type = state["graph_type"]
    triplet = state["current_triplet"]
    existing_graph = state["existing_graph"]

    # --- deterministic shortcut: exact reproduction of a VERIFIED edge, no call at all ---
    if graph_type == "full_triplets":
        exact = find_exact_duplicate(existing_graph, triplet, require_verified=True)
        if exact is not None:
            finding = (f"Deterministic exact match against a VERIFIED edge: the graph already contains it "
                       f"as ({exact['subject']}, {exact['predicate']}, {exact['object']}). "
                       f"No model call was made.")
            return {
                "evaluation_status": "redundant",
                "evaluation_diagnosis": (
                    f"Duplicate. The relation {exact['subject']} -> {exact['object']} is already an edge "
                    f"in the graph with the same predicate. Matched in Python, not judged."
                ),
                "duplicate_of": exact,
                "predicate_note": None,
                "evaluation_claim_check": finding,
                "evaluation_direction_check": finding,
                "evaluation_better_predicate": None,
                "evaluation_mediator_in_text": None,
                "evaluation_mediator_is_covered": False,
                "evaluation_is_supported": True,
                "evaluation_graph_note": finding,
                "evaluation_error_type": "duplicate",
            }

    # ---------------- CALL 1: text only. The graph is NOT in this context. ----------------
    text_agent = ChatOpenAI(model="gpt-4o-mini", temperature=0).with_structured_output(TextJudgmentOutput)
    text_prompt = ChatPromptTemplate.from_messages([
        ("system", TEXT_JUDGMENT_SYSTEM_PROMPT),
        ("human",
         "Source Text: {text}\n"
         "Candidate Triplet: ({subject}, {predicate}, {object})")
    ])
    tj: TextJudgmentOutput = text_agent.invoke(text_prompt.format_prompt(
        text=state["source_text"],
        subject=triplet["subject"],
        predicate=triplet["predicate"],
        object=triplet["object"],
    ))
    mediator = (tj.mediator_in_text or "").strip()
    if mediator.lower() in ("null", "none", "n/a", "-", ""):
            mediator = None
    tj.mediator_in_text = mediator
    bp = (tj.better_predicate or "").strip()
    tj.better_predicate = None if bp.lower() in ("null", "none", "n/a", "-", "") else bp
    # ---------------- CALL 2: graph only. Skipped when it cannot change the answer. ----------------
    gj: GraphJudgmentOutput | None = None
    if tj.is_supported and graph_type == "full_triplets":
        graph_agent = ChatOpenAI(model="gpt-4o-mini", temperature=0).with_structured_output(GraphJudgmentOutput)
        graph_prompt = ChatPromptTemplate.from_messages([
            ("system", GRAPH_JUDGMENT_SYSTEM_PROMPT),
            ("human",
             "Candidate Triplet: ({subject}, {predicate}, {object})\n"
             "MEDIATOR IN TEXT: {mediator}\n"
             "CANDIDATE CONTEXT (verified graph only - authoritative, do not recompute):\n{context}")
        ])
        gj = graph_agent.invoke(graph_prompt.format_prompt(
            subject=triplet["subject"],
            predicate=triplet["predicate"],
            object=triplet["object"],
            mediator=mediator,
            context=build_candidate_context(existing_graph, triplet),
        ))

    

    status = derive_status(tj, gj, graph_type)
    error_type = derive_error_type(tj, gj, status)

    duplicate = gj.duplicate_of.model_dump() if (gj and gj.duplicate_of) else None
    if duplicate is None and status != "incorrect" and graph_type == "full_triplets":
        duplicate = find_exact_duplicate(existing_graph, triplet, require_verified=True)
        if duplicate is not None:
            status = "redundant"

    # The corrector needs one diagnosis. Text-side is the substance; add the graph note when the
    # graph is what decided the verdict (uncovered mediator).
    diagnosis = tj.diagnosis
    if status == "incorrect" and tj.is_supported and tj.mediator_in_text:
        diagnosis = (f"Skipped mediator. {tj.diagnosis} The mediating entity "
                     f"'{tj.mediator_in_text}' is not represented on a verified path into the "
                     f"candidate's subject.")

    return {
        "evaluation_status": status,
        "evaluation_diagnosis": diagnosis,
        "duplicate_of": duplicate if status == "redundant" else None,
        "predicate_note": gj.predicate_note if gj else None,
        # --- text-side reasoning ---
        "evaluation_claim_check": tj.claim_check,
        "evaluation_direction_check": tj.direction_check,
        "evaluation_mediator_in_text": tj.mediator_in_text,
        "evaluation_is_supported": tj.is_supported,
        "evaluation_better_predicate": tj.better_predicate,
        # --- graph-side reasoning ---
        "evaluation_graph_path_check": gj.graph_path_check if gj else "(graph judgment skipped)",
        "evaluation_mediator_is_covered": gj.mediator_is_covered if gj else False,
        "evaluation_graph_note": gj.graph_note if gj else "(graph judgment skipped)",
        "evaluation_error_type": error_type,
    }