from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from app.schemas import GapAnalysisOutput
from app.prompts import GAP_ANALYZER_SYSTEM_PROMPT
from app.utils.graph_parser import extract_edges
from typing import List, Optional, Dict, Any, Tuple
from app.utils.timing import log_timing, logger


@log_timing
async def analyze_gaps(source_text: str, existing_graph: List[dict]) -> dict:
    """Nudge the student toward parts of the passage their map doesn't cover yet.

    Counts ALL drawn edges, not just verified ones: a student who drew something has engaged with
    that part of the text, and nudging them to map what they already mapped would be noise. This
    is the opposite of the evaluator's verified-only gate, because the question is different -
    coverage, not truth.

    Returns {"gaps": [...], "overall": str, "coverage_review": str, "n_edges": int}.
    """
    edges = extract_edges(existing_graph)
    if not edges:
        return {
            "gaps": [],
            "overall": "Your map is empty - start anywhere in the passage that states a clear relation.",
            "coverage_review": "No connections drawn yet, so nothing is covered.",
            "n_edges": 0,
        }

    drawn = "\n".join(f"- {s} --{p}--> {o}" for (s, p, o) in edges)
    logger.info(f"analyze_gaps: {len(edges)} drawn connection(s)")

    agent = ChatOpenAI(model="gpt-4o-mini", temperature=0).with_structured_output(GapAnalysisOutput)
    prompt = ChatPromptTemplate.from_messages([
        ("system", GAP_ANALYZER_SYSTEM_PROMPT),
        ("human",
         "Source Text:\n{text}\n\n"
         "Connections the student has drawn:\n{drawn}\n\n"
         "What parts of the passage are not represented yet?")
    ])
    result = await agent.ainvoke(prompt.format_prompt(text=source_text, drawn=drawn))

    # Drop any gap whose span isn't actually in the passage: a hallucinated span would break the
    # frontend highlight silently. Whitespace-normalised so line breaks and spacing in the source
    # don't cause false rejections.
    normalized_text = " ".join(source_text.split()).casefold()
    gaps = []
    for g in result.gaps:
        span = g.source_span or ""
        if span and " ".join(span.split()).casefold() in normalized_text:
            gaps.append(g.model_dump())
        else:
            logger.info(f"analyze_gaps: dropping gap with ungrounded span {span[:60]!r}")

    # If every gap was dropped, don't leave an 'overall' claiming things are missing with nothing
    # to point at - that reads as a bug to the student.
    overall = result.overall
    if result.gaps and not gaps:
        overall = "Couldn't pin down anything specific that's missing - have another look at the passage yourself."
        logger.info("analyze_gaps: all gaps dropped as ungrounded, overall replaced")

    logger.info(f"analyze_gaps: returning {len(gaps)} gap(s)")
    return {
        "gaps": gaps,
        "overall": overall,
        "coverage_review": result.coverage_review,   # INTERNAL - reasoning, not for display
        "n_edges": len(edges),
    }