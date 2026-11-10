from fastapi import APIRouter, HTTPException
from app.schemas import CheckTripletRequest, CheckTripletResponse
from app.utils import parse_existing_graph
from app.graph import pipeline_graph
from typing import List, Tuple, Dict, Optional
from app.utils.graph_parser import _norm, _triplet_of, _topo_edge_order, _edge_key, _add_node, _match_node
from app.agents import evaluator_node
from starlette.concurrency import run_in_threadpool
from app.utils.timing import log_timing, logger
import time

@log_timing
async def check_triplet(source_text: str, existing_graph: List[dict], triplet: dict) -> dict:
    """Run the full pipeline for one candidate triplet, return the API-shaped dict."""
    graph_type, existing_nodes = parse_existing_graph(existing_graph)

    result = await pipeline_graph.ainvoke({
        "source_text": source_text,
        "existing_graph": existing_graph,
        "current_triplet": triplet,
        "graph_type": graph_type,
        "existing_nodes": existing_nodes,
    })

    return {
        "graph_state": graph_type,
        "verification": {
            "status": result["evaluation_status"],
            "error_type": result.get("evaluation_error_type"),
            "diagnosis": result["evaluation_diagnosis"],       # INTERNAL - do not render
            "duplicate_of": result.get("duplicate_of"),
            "predicate_note": result.get("predicate_note"),
            "better_predicate": result.get("better_predicate"),
            "reasoning": {
                "is_supported": result.get("evaluation_is_supported"),
                "claim_check": result.get("evaluation_claim_check"),
                "semantic_relation_check": result.get("evaluation_direction_check"),
                "mediator_in_text": result.get("evaluation_mediator_in_text"),
                "mediator_is_covered": result.get("evaluation_mediator_is_covered"),
                "graph_path_check": result.get("evaluation_graph_path_check"),
                "graph_note": result.get("evaluation_graph_note"),
            },
        },
        "correction": (
            {
                "fixed_triplets": result["correction"],
                "rationale": result["correction_rationale"],   # INTERNAL - do not render
                "outcome": result.get("correction_outcome"),
                "grounding": result.get("correction_grounding") or [],
            }
            if result.get("correction") is not None else None
        ),
        "resolutions": result.get("resolutions"),
        "suggested_triplets": result.get("suggested_triplet"),
        "hint": result.get("student_hint"),
        "reflection": result.get("student_reflection"),
    }


async def _evaluate_only(source_text: str, context_graph: list, triplet: dict) -> dict:
    """Run just the evaluator on one triplet (no corrector/resolver/hinter), off the event loop.
    evaluator_node is a sync graph node, so it runs in a threadpool rather than being awaited."""
    graph_type, existing_nodes = parse_existing_graph(context_graph)
    return await run_in_threadpool(evaluator_node, {
        "source_text": source_text,
        "existing_graph": context_graph,
        "current_triplet": triplet,
        "graph_type": graph_type,
        "existing_nodes": existing_nodes,
    })


async def verify_graph(source_text: str, graph: List[dict]) -> Tuple[List[dict], dict]:
    """Verify every unverified edge in the graph, root-first.

    Returns (updated_graph, report). The updated graph is a fresh list (the caller's is never
    mutated); edges that pass gain 'verified': True. report has:
      - "summary": counts per state.
      - "results": one full entry per edge (internal - includes the whole check_triplet result,
        blocked_by, etc.).
      - "student": one trimmed entry per edge {triplet, state, status, reflection, hint,
        suggested_triplets}.

    States: verified / flagged / blocked. Only 'incorrect' blocks its descendants; 'incomplete'
    and 'redundant' are reported but block nothing. Each edge is judged against the graph MINUS
    itself, so it can't match its own copy, and it sees verifications made earlier in this pass.
    Sequential by design: root-first ordering depends on each edge committing before the next.

    One evaluation path only: check_triplet runs the full pipeline, and its router already sends a
    'correct'/'redundant' edge straight past the corrector, so a passing edge costs a single
    evaluator call (plus a cheap resolver/hinter whose output we ignore). No separate evaluate.
    """
    edges = [dict(e) for e in (graph or [])
             if isinstance(e, dict) and e.get("predicate") and e.get("subject") and e.get("object")]
    non_edges = [e for e in (graph or [])
                 if not (isinstance(e, dict) and e.get("predicate") and e.get("subject") and e.get("object"))]

    order = _topo_edge_order(edges)
    verify_started = time.perf_counter()
    to_check = sum(1 for e in order if not e.get("verified"))
    logger.info(f"verify_graph: {len(order)} edges, {to_check} unverified, "
                f"{len(order) - to_check} already verified")

    incorrect_keys: set = set()
    blocked_root: Dict[tuple, dict] = {}
    results: List[dict] = []
    student: List[dict] = []

    def blocking_ancestor(edge: dict) -> Optional[dict]:
        """The incorrect triplet this edge builds on, directly or transitively, or None.
        Only 'incorrect' propagates; incomplete/redundant ancestors do not block."""
        sk = _norm(edge["subject"])
        for other in edges:
            if _norm(other["object"]) == sk:
                k = _edge_key(other)
                if k in incorrect_keys:
                    return _triplet_of(other)
                if k in blocked_root:
                    return blocked_root[k]
        return None

    for i, edge in enumerate(order, start=1):
        trip = _triplet_of(edge)
        key = _edge_key(edge)
        edge_label = f"[{i}/{len(order)}] ({trip['subject']}, {trip['predicate']}, {trip['object']})"

        # already verified -> left alone, still counts as context for later edges
        if edge.get("verified"):
            logger.info(f"verify_graph {edge_label}: already verified, skipped")
            results.append({"triplet": trip, "state": "verified", "note": "already verified"})
            student.append({"triplet": trip, "state": "verified", "status": None, "error_type": None,
                            "reflection": None, "hint": None, "suggested_triplets": []})
            continue

        # builds on an incorrect edge -> blocked, no model call
        root = blocking_ancestor(edge)
        if root is not None:
            logger.info(f"verify_graph {edge_label}: blocked by ancestor, skipped (no model call)")
            blocked_root[key] = root
            reason = (f"builds on a connection flagged incorrect: "
                      f"({root['subject']} {root['predicate']} {root['object']}) - "
                      f"fix that, then verify again")
            results.append({"triplet": trip, "state": "blocked", "blocked_by": root, "reason": reason})
            student.append({"triplet": trip, "state": "blocked", "status": None, "error_type": None,
                            "reflection": None,
                            "hint": f"Fix \"{root['subject']} {root['predicate']} {root['object']}\" "
                                    f"first - this connection builds on it.",
                            "suggested_triplets": []})
            continue

        # single evaluation path: full pipeline, judged against the graph minus this edge
        edge_started = time.perf_counter()
        context = non_edges + [e for e in edges if _edge_key(e) != key]
        full = await check_triplet(source_text, context, trip)
        status = full["verification"]["status"]
        logger.info(f"verify_graph {edge_label}: {status} "
                    f"({time.perf_counter() - edge_started:.2f}s)")

        if status == "correct":
            edge["verified"] = True   # visible to later edges in this same pass
            results.append({"triplet": trip, "state": "verified", "status": status, "result": full})
            student.append({"triplet": trip, "state": "verified", "status": None, "error_type": None,
                            "reflection": None, "hint": None, "suggested_triplets": []})
        else:
            # flagged: incorrect / incomplete / redundant
            if status == "incorrect":
                incorrect_keys.add(key)   # ONLY incorrect blocks downstream
            results.append({"triplet": trip, "state": "flagged", "status": status, "result": full})
            student.append({
                "triplet": trip, "state": "flagged", "status": status,
                "error_type": full["verification"].get("error_type"),
                "reflection": full.get("reflection") if status in ("incorrect", "incomplete") else None,
                "hint": full.get("hint"),
                "suggested_triplets": full.get("suggested_triplets") or [],
            })

    updated = non_edges + edges
    summary = {
        "verified": sum(1 for r in results if r["state"] == "verified"),
        "flagged": sum(1 for r in results if r["state"] == "flagged"),
        "blocked": sum(1 for r in results if r["state"] == "blocked"),
        "flagged_incorrect": sum(1 for r in results if r["state"] == "flagged" and r["status"] == "incorrect"),
        "flagged_incomplete": sum(1 for r in results if r["state"] == "flagged" and r["status"] == "incomplete"),
        "flagged_redundant": sum(1 for r in results if r["state"] == "flagged" and r["status"] == "redundant"),
    }
    logger.info(f"verify_graph: finished in {time.perf_counter() - verify_started:.2f}s - {summary}")
    return updated, {"summary": summary, "results": results, "student": student}