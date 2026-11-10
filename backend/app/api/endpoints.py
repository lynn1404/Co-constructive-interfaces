
from app.agents.simple_agent import evaluate_map
from app.schemas import SimpleEvalRequest, SimpleEvalResponse
from fastapi import APIRouter, HTTPException
from app.schemas import CheckTripletRequest, CheckTripletResponse, VerifyGraphRequest, VerifyGraphResponse, ResolveNodesRequest, ResolveNodesResponse, GapAnalysisRequest, GapAnalysisResponse, SegmentResponse, SegmentRequest, ClassifyShapeResponse, ClassifyShapeRequest, ChatResponse, ChatRequest, ResolveNodesResponse, ResolveNodesRequest, SimpleGapRequest, SimpleGapResponse, SimpleSegmentRequest, SimpleSegmentResponse
from app.api.helpers import check_triplet, verify_graph
from app.agents.graph_resolver import graph_resolver
from app.agents.gap_analyzer import analyze_gaps
from app.agents.segmenter import segment_concepts
from app.agents.classifer import classify_shape
from app.agents.node_resolver import resolve_nodes
from app.agents.simple_gap_analyzer import analyze_gaps_simple
from app.agents.simple_segmenter import simple_segment_concepts
from app.utils.timing import logger
from typing import Optional, List, Dict
from langchain_openai import ChatOpenAI

router = APIRouter()

@router.post("/check-triplet", response_model=CheckTripletResponse)
async def check_triplet_endpoint(payload: CheckTripletRequest):
    try:
        r = await check_triplet(
            payload.source_text,
            payload.existing_graph,
            payload.triplet.model_dump(),
        )
        return CheckTripletResponse(
            graph_state=r["graph_state"],
            verification=r["verification"],
            correction=r["correction"],
            resolutions=r["resolutions"],
            suggested_triplets=r["suggested_triplets"],
            hint=r["hint"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/verify-graph", response_model=VerifyGraphResponse)
async def verify_graph_endpoint(payload: VerifyGraphRequest):
    try:
        updated, report = await verify_graph(payload.source_text, payload.existing_graph)
        logger.info(f"verify_graph full report: {report}")
        return VerifyGraphResponse(
            updated_graph=updated,
            summary=report["summary"],
            results=report["results"],
            student=report["student"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/check-resolve-nodes", response_model=ResolveNodesResponse)
async def check_resolve_nodes(payload: ResolveNodesRequest):
    try:
        kwargs = {} if payload.threshold is None else {"threshold": payload.threshold}
        result = await graph_resolver(payload.existing_graph, payload.source_text, **kwargs)
        logger.info(f"check_resolve_nodes full result: {result}")
        return ResolveNodesResponse(clusters=result["clusters"], groups=result["groups"], n_nodes=result["n_nodes"])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze-gaps", response_model=GapAnalysisResponse)
async def analyze_gaps_endpoint(payload: GapAnalysisRequest):
    try:
        result = await analyze_gaps(payload.source_text, payload.existing_graph)
        return GapAnalysisResponse(
            gaps=result["gaps"],
            overall=result["overall"],
            n_edges=result["n_edges"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/segment-concepts", response_model=SegmentResponse)
async def segment_concepts_endpoint(payload: SegmentRequest):
    try:
        result = await segment_concepts(payload.highlighted_text, payload.full_text)
        return SegmentResponse(
            concepts=result["concepts"],
            n_concepts=result["n_concepts"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@router.post("/classify-shape", response_model=ClassifyShapeResponse)
async def classify_shape_endpoint(payload: ClassifyShapeRequest):
    try:
        r = await classify_shape(payload.answer, payload.user_prompt)
        return ClassifyShapeResponse(
            is_mappable=r["is_mappable"],
            shapes=r["shapes"],
            primary=r["primary"],
            reason=r["reason"],
            gated_by=r["gated_by"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


   # the classify_shape result

@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(payload: ChatRequest):
    try:
        llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.7)
        messages = [(m["role"], m["content"]) for m in payload.history]
        messages.append(("user", payload.message))
        result = await llm.ainvoke(messages)
        answer = result.content

        classification = await classify_shape(answer, payload.message)
        return ChatResponse(answer=answer, classification=classification)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
 
 
@router.post("/simple-evaluate", response_model=SimpleEvalResponse)
async def simple_evaluate_endpoint(payload: SimpleEvalRequest):
    try:
        updated, report = await evaluate_map(payload.source_text, payload.existing_graph)
        return SimpleEvalResponse(
            updated_graph=updated,
            summary=report["summary"],
            results=report["results"],
            student=report["student"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/simple-resolve-nodes", response_model=ResolveNodesResponse)
async def simple_resolve_nodes_endpoint(payload: ResolveNodesRequest):
    try:
        result = await resolve_nodes(payload.existing_graph)
        return ResolveNodesResponse(groups=result["groups"], n_nodes=result["n_nodes"])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/simple-analyze-gaps", response_model=SimpleGapResponse)
async def simple_analyze_gaps_endpoint(payload: SimpleGapRequest):
    try:
        result = await analyze_gaps_simple(payload.source_text, payload.existing_graph)
        return SimpleGapResponse(
            gaps=result["gaps"],
            overall=result["overall"],
            n_verified=result["n_verified"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/simple-segment-concepts", response_model=SimpleSegmentResponse)
async def simple_segment_concepts_endpoint(payload: SimpleSegmentRequest):
    try:
        result = await simple_segment_concepts(payload.highlighted_text, payload.full_text)
        return SimpleSegmentResponse(
            concepts=result["concepts"],
            n_concepts=result["n_concepts"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
 