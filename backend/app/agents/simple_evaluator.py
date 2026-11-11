import logging
import re
import unicodedata

from langchain_core.prompts import ChatPromptTemplate

from app.config import get_llm
from app.prompts import SIMPLE_AGENT_SYSTEM_PROMPT
from app.schemas import MapEvaluation
from app.utils.timing import log_timing

logger = logging.getLogger(__name__)

_TRIPLET_RE = re.compile(r"^\s*(.+?)\s*--\[?(.+?)\]?-->\s*(.+?)\s*$")
_NON_WORD_RE = re.compile(r"[\W_]+")

def _parse_correction(s: str) -> dict | None:
    """Turn 'subject --[relation]--> object' into a triplet dict, or None when the model wrote
    guidance instead of a triplet."""
    if not s or not s.strip():
        return None
    m = _TRIPLET_RE.match(s.strip())
    if not m:
        return None
    subj, pred, obj = (p.strip() for p in m.groups())
    return {"subject": subj, "predicate": pred, "object": obj} if subj and pred and obj else None

def _words_only(s: str) -> str:
    """Reduce text to lowercase words separated by single spaces, so Markdown markers,
    punctuation, curly quotes and dashes cannot cause a mismatch."""
    s = unicodedata.normalize("NFKC", s or "").casefold()
    return _NON_WORD_RE.sub(" ", s).strip()

def _verify_quote(quote: str, source_text: str) -> bool:
    """True if the quote's words appear, contiguous and in order, in the source text.
    'unsupported' and empty are not quotes and are exempt."""
    q = _words_only(quote)
    if not q or q == "unsupported":
        return True
    # pad with spaces so the match starts and ends on whole words
    return f" {q} " in f" {_words_only(source_text)} "


def _is_edge(e: dict) -> bool:
    return bool(isinstance(e, dict) and e.get("subject") and e.get("predicate") and e.get("object"))




@log_timing
async def evaluate_map(source_text: str, edges: list[dict]) -> tuple[list[dict], dict]:
    """
    Evaluates a student's knowledge graph by validating each complete triplet against
    the reference text using an LLM. Preserves previously judged edges, evaluates only
    new or modified edges, verifies supporting quotes, and returns updated graph data
    along with evaluation results and student-facing feedback.
    """

    non_edges = [e for e in edges if not _is_edge(e)]
    edges = [dict(e) for e in edges if _is_edge(e)]

    # if no complete edges, meaning only isolated nodes, return early with empty results
    if not edges:
        return non_edges, {"summary": {"verified": 0, "flagged": 0, "blocked": 0},
                    "results": [], "student": []}

    # Skip edges already judged (either as correct or incorrect). The frontend clears both fields when the
    # student edits a triplet, so an unchanged triplet is never re-evaluated.
    already_judged = {i for i, e in enumerate(edges)
                      if e.get("verified") or e.get("flagged")}
    to_grade = {i: e for i, e in enumerate(edges) if i not in already_judged}

    # Nothing left to grade, so return the existing graph and a report based on already existing judgments.
    if not to_grade:
        results, student = [], []
        for e in edges:
            trip = {k: e[k] for k in ("subject", "predicate", "object")}
            if e.get("verified"):
                results.append({"triplet": trip, "state": "verified",
                                 "note": "already verified"})
                student.append({"triplet": trip, "state": "verified", "status": None,
                                 "reflection": None, "hint": None, "suggested_triplets": []})
            else:
                j = e.get("_judgment", {})
                fix = _parse_correction(j.get("suggested_correction", ""))
                results.append({"triplet": trip, "state": "flagged", "status": "incorrect",
                                 "note": "already judged"})
                student.append({"triplet": trip, "state": "flagged", "status": "incorrect",
                                 "reflection": None, "hint": j.get("justification"),
                                 "suggested_triplets": [fix] if fix else []})
        summary = {
            "verified": sum(1 for r in results if r["state"] == "verified"),
            "flagged":  sum(1 for r in results if r["state"] == "flagged"),
            "blocked":  0,
        }
        return non_edges + edges, {"summary": summary, "results": results, "student": student}

    # Already-judged edges appear as context so the model can detect duplicates and
    # contradictions against them, but labelled so it returns no verdict for them.
    already_lines = "\n".join(
        f"{i}: {edges[i]['subject']} --[{edges[i]['predicate']}]--> {edges[i]['object']}"
        f"  [already judged: {'correct' if edges[i].get('verified') else 'incorrect'} - do not grade]"
        for i in sorted(already_judged)
    )
    grade_lines = "\n".join(
        f"{i}: {e['subject']} --[{e['predicate']}]--> {e['object']}"
        for i, e in sorted(to_grade.items())
    )

    agent = get_llm().with_structured_output(MapEvaluation)
    prompt = ChatPromptTemplate.from_messages([
        ("system", SIMPLE_AGENT_SYSTEM_PROMPT),
        ("human",
         "REFERENCE TEXT:\n{text}\n\n"
         "ALREADY JUDGED EDGES (context only - do NOT return evaluations for these):\n{already}\n\n"
         "Evaluate each edge below ONE AT A TIME, in order. For each: find the relevant text, "
         "judge it, record the verdict before moving to the next.\n\n"
         "EDGES TO GRADE:\n{to_grade}\n\n"
         "Return exactly {n} evaluations, one per index.")
    ])
    result = await agent.ainvoke(prompt.format_prompt(
        text=source_text,
        already=already_lines or "(none)",
        to_grade=grade_lines,
        n=len(to_grade)))

    by_idx = {ev.edge_index: ev for ev in result.evaluations}
    missing = [i for i in to_grade if i not in by_idx]
    if missing:
        logger.warning("evaluate_map: no verdict for indices %s", missing)


    results, student = [], []
    for i, edge in enumerate(edges):
        trip = {"subject": edge["subject"], "predicate": edge["predicate"],
                "object": edge["object"]}

        # Already judged — pass through using stored verdict.
        if i in already_judged:
            if edge.get("verified"):
                results.append({"triplet": trip, "state": "verified",
                                 "note": "already verified"})
                student.append({"triplet": trip, "state": "verified", "status": None,
                                 "reflection": None, "hint": None,
                                 "suggested_triplets": []})
            else:
                j = edge.get("_judgment", {})
                fix = _parse_correction(j.get("suggested_correction", ""))
                results.append({"triplet": trip, "state": "flagged", "status": "incorrect",
                                 "note": "already judged"})
                student.append({"triplet": trip, "state": "flagged", "status": "incorrect",
                                 "reflection": None,
                                 "hint": j.get("justification"),
                                 "suggested_triplets": [fix] if fix else []})
            continue

        ev = by_idx.get(i)

        # Model returned no verdict for this edge, save as unevaluated so it can be reviewed next turn.
        if ev is None:
            results.append({"triplet": trip, "state": "flagged", "status": "not_evaluated"})
            student.append({"triplet": trip, "state": "flagged", "status": "not_evaluated",
                            "reflection": None,
                            "hint": "Could not be checked - try again.",
                            "suggested_triplets": []})
            continue

        quote_ok = _verify_quote(ev.text_grounded, source_text)
        if ev.verdict == "correct":
            edge["verified"] = True
            edge.pop("flagged", None)
            edge.pop("_judgment", None)
            results.append({"triplet": trip, "state": "verified",
                            "confidence": ev.confidence,
                            "text_grounded": ev.text_grounded,
                            "quote_verified": quote_ok,
                            "justification": ev.justification})
            student.append({"triplet": trip, "state": "verified", "status": None,
                            "reflection": None, "hint": None, "suggested_triplets": []})
        else:
            edge["flagged"] = True
            edge["_judgment"] = {
                "justification": ev.justification,
                "suggested_correction": ev.suggested_correction,
            }
            fix = _parse_correction(ev.suggested_correction)
            results.append({"triplet": trip, "state": "flagged", "status": "incorrect",
                            "confidence": ev.confidence,
                            "text_grounded": ev.text_grounded,
                            "quote_verified": quote_ok,
                            "justification": ev.justification,
                            "suggested_correction": ev.suggested_correction})
            student.append({"triplet": trip, "state": "flagged", "status": "incorrect",
                            "reflection": None,
                            "hint": ev.justification,
                            "suggested_triplets": [fix] if fix else []})

    summary = {
        "verified": sum(1 for r in results if r["state"] == "verified"),
        "flagged":  sum(1 for r in results if r["state"] == "flagged"),
        "blocked":  0,
    }
    return non_edges + edges, {"summary": summary, "results": results, "student": student}
