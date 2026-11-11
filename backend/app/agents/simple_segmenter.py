
from langchain_core.prompts import ChatPromptTemplate

from app.config import get_llm
from app.prompts import SIMPLE_SEGMENTER_SYSTEM_PROMPT
from app.schemas import SimpleSegmenterOutput
from app.utils.graph_parser import _norm
from app.utils.timing import log_timing, logger


@log_timing
async def simple_segment_concepts(highlighted_text: str, full_text: str | None = None) -> dict:
    """Extract concepts from a student's highlighted span.
    Paraphrase is allowed - the model suggests clean node labels, not verbatim extracts.
    Returns {"concepts": [{label, source_span}], "n_concepts": int, "reasoning": str}.
    """
    if not highlighted_text or not highlighted_text.strip():
        return {"concepts": [], "n_concepts": 0, "reasoning": None}

    agent = get_llm().with_structured_output(SimpleSegmenterOutput)
    prompt = ChatPromptTemplate.from_messages([
        ("system", SIMPLE_SEGMENTER_SYSTEM_PROMPT),
        ("human",
         "Full passage (context only - do NOT extract from this):\n{full_text}\n\n"
         "HIGHLIGHTED SPAN (extract from this only):\n{span}\n\n"
         "What concepts from this span could become nodes on the student's map?")
    ])
    result = await agent.ainvoke(prompt.format_prompt(
        full_text=full_text or "(not provided)",
        span=highlighted_text,
    ))

    concepts, seen = [], set()
    for c in result.concepts:
        label = " ".join((c.label or "").split())
        if not label or _norm(label) in seen:
            continue
        seen.add(_norm(label))
        concepts.append({
            "label": label,
            "source_span": " ".join((c.source_span or "").split()) or label,
        })

    logger.info("segment_concepts: %d concept(s) from %d-char span", len(concepts), len(highlighted_text))
    return {
        "concepts": concepts,
        "n_concepts": len(concepts),
        "reasoning": result.segmentation_reasoning,   # INTERNAL - not for display
    }
