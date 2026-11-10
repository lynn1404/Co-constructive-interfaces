from typing import List, Optional
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

from app.schemas import SegmenterOutput
from app.prompts import SEGMENTER_SYSTEM_PROMPT
from app.utils.graph_parser import _norm
from app.utils.timing import logger


async def segment_concepts(highlighted_text: str, full_text: Optional[str] = None) -> dict:
    """Extract node-ready concepts from a span of text the student highlighted.

    Concepts only - no relations, and no reference to the student's graph: this runs standalone, so
    it can be called the moment a span is highlighted, before anything is drawn.

    full_text is optional surrounding passage, used ONLY to interpret how the span's phrases are
    being used (whether a phrase is one idea or two, what a bare noun refers to). Concepts are
    extracted from the span alone; the prompt states that constraint explicitly.

    Note there is deliberately no substring check on the returned labels. The model legitimately
    reorders words into natural node names ("stores water" -> "water storage"), and an earlier
    verbatim-match guard silently dropped those. Only exact duplicates are filtered.

    Returns {"concepts": [...], "n_concepts": int, "reasoning": str}.
    """
    if not highlighted_text or not highlighted_text.strip():
        return {"concepts": [], "n_concepts": 0, "reasoning": None}

    agent = ChatOpenAI(model="gpt-4o-mini", temperature=0).with_structured_output(SegmenterOutput)
    prompt = ChatPromptTemplate.from_messages([
        ("system", SEGMENTER_SYSTEM_PROMPT),
        ("human",
         "Full passage (context only - do NOT extract from this):\n{full_text}\n\n"
         "HIGHLIGHTED SPAN (extract from this only):\n{span}\n\n"
         "Extract the concepts.")
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

    logger.info(f"segment_concepts: {len(concepts)} concept(s) from a {len(highlighted_text)}-char span")
    return {
        "concepts": concepts,
        "n_concepts": len(concepts),
        "reasoning": result.segmentation_reasoning,   # INTERNAL - not for display
    }