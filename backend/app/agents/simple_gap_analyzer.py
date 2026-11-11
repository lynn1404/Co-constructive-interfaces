
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI

from app.prompts import SIMPLE_GAP_SYSTEM_PROMPT
from app.schemas import GapAnalysis
from app.utils.timing import log_timing, logger


@log_timing
async def analyze_gaps_simple(source_text: str, existing_graph: list[dict]) -> dict:
    """Identify ideas in the text not captured by the verified subgraph.

    Only verified edges are sent - unverified ones are excluded because an unconfirmed edge
    should not count as coverage.

    Returns {"gaps": [{idea, placement}], "overall": str, "n_verified": int}.
    coverage_review is returned for debugging but is INTERNAL - not for display.
    """
    verified_edges = [
        (s, p, o) for e in existing_graph
        if isinstance(e, dict) and e.get("verified")
        for s, p, o in [( e.get("subject",""), e.get("predicate",""), e.get("object",""))]
        if s and p and o
    ]

    if not verified_edges:
        return {
            "gaps": [],
            "overall": "Your map has no verified connections yet - start by verifying some edges first.",
            "coverage_review": "No verified edges to compare against.",
            "n_verified": 0,
        }

    drawn = "\n".join(f"- {s} --[{p}]--> {o}" for s, p, o in verified_edges)
    logger.info("analyze_gaps_simple: comparing %d verified edge(s) against text", len(verified_edges))

    agent = ChatOpenAI(model="gpt-4o-mini", temperature=0).with_structured_output(GapAnalysis)
    prompt = ChatPromptTemplate.from_messages([
        ("system", SIMPLE_GAP_SYSTEM_PROMPT),
        ("human",
         "Source text:\n{text}\n\n"
         "Student's verified connections:\n{drawn}\n\n"
         "What important ideas from the text are missing from the map?")
    ])
    result = await agent.ainvoke(prompt.format_prompt(text=source_text, drawn=drawn))

    gaps = [{"idea": g.idea, "placement": g.placement} for g in result.gaps]
    logger.info("analyze_gaps_simple: %d gap(s) found", len(gaps))

    return {
        "gaps": gaps,
        "overall": result.overall,
        "coverage_review": result.coverage_review,   # INTERNAL
        "n_verified": len(verified_edges),
    }
