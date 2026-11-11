import logging

from fastapi import APIRouter

#importing error handler for on purpose errors
#importing chat functions
from app.agents.classifier import classify_shape
from app.agents.node_resolver import resolve_nodes

#importing pipeline functions
from app.agents.simple_evaluator import evaluate_map
from app.agents.simple_gap_analyzer import analyze_gaps_simple
from app.agents.simple_segmenter import simple_segment_concepts
from app.api.error_handling import AppError
from app.config import get_llm

#importing Chat schemas
#importing pipeline schemas
from app.schemas import (
    ChatRequest,
    ChatResponse,
    ClassifyShapeRequest,
    ClassifyShapeResponse,
    ResolveNodesRequest,
    ResolveNodesResponse,
    SimpleEvalRequest,
    SimpleEvalResponse,
    SimpleGapRequest,
    SimpleGapResponse,
    SimpleSegmentRequest,
    SimpleSegmentResponse,
)

router = APIRouter()
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------- chat

@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(payload: ChatRequest):
    if not payload.message.strip():
        raise AppError("The message is empty.", code="empty_message")

    llm = get_llm()
    messages = [(m.role, m.content) for m in payload.history]
    messages.append(("user", payload.message))
    result = await llm.ainvoke(messages)
    answer = result.content

    classification = await classify_shape(answer, payload.message)
    return ChatResponse(answer=answer, classification=classification)


@router.post("/classify-shape", response_model=ClassifyShapeResponse)
async def classify_shape_endpoint(payload: ClassifyShapeRequest):
    r = await classify_shape(payload.answer, payload.user_prompt)
    return ClassifyShapeResponse(
        is_mappable=r["is_mappable"],
        shapes=r["shapes"],
        primary=r["primary"],
        reason=r["reason"],
        gated_by=r["gated_by"],
    )


# ---------------------------------------------------------------- simple pipeline (used by the UI)

@router.post("/simple-evaluate", response_model=SimpleEvalResponse)
async def simple_evaluate_endpoint(payload: SimpleEvalRequest):
    if not payload.source_text.strip():
        raise AppError("The source text is empty.", code="empty_source_text")

    updated, report = await evaluate_map(payload.source_text, payload.existing_graph)
    return SimpleEvalResponse(
        updated_graph=updated,
        summary=report["summary"],
        results=report["results"],
        student=report["student"],
    )


@router.post("/simple-resolve-nodes", response_model=ResolveNodesResponse)
async def simple_resolve_nodes_endpoint(payload: ResolveNodesRequest):
    result = await resolve_nodes(payload.existing_graph)
    return ResolveNodesResponse(groups=result["groups"], n_nodes=result["n_nodes"])


@router.post("/simple-analyze-gaps", response_model=SimpleGapResponse)
async def simple_analyze_gaps_endpoint(payload: SimpleGapRequest):
    result = await analyze_gaps_simple(payload.source_text, payload.existing_graph)
    return SimpleGapResponse(
        gaps=result["gaps"],
        overall=result["overall"],
        n_verified=result["n_verified"],
    )


@router.post("/simple-segment-concepts", response_model=SimpleSegmentResponse)
async def simple_segment_concepts_endpoint(payload: SimpleSegmentRequest):
    result = await simple_segment_concepts(payload.highlighted_text, payload.full_text)
    return SimpleSegmentResponse(
        concepts=result["concepts"],
        n_concepts=result["n_concepts"],
    )

