from app.schemas.agent_outputs import (
    Triplet,
    RelationMatch,
    ResolverOutput,
    CorrectorOutput,
    HinterOutput,
    ClusterResolution,
    TextJudgmentOutput,
    GraphJudgmentOutput, 
    GapAnalysisOutput,
    GapArea,
    ExtractedConcept,
    ShapeClassification, 
    ShapeOption, 
    ChatRequest, 
    ChatResponse, 
    MapEvaluation, 
    EdgeEvaluation,
    MergeGroup,
    NodeResolution,
    Gap, 
    GapAnalysis,
    SimpleSegmenterOutput,
    ExtractedConcept,
    SegmenterOutput

)
from app.schemas.graph_state import GraphState
from app.schemas.api_payloads import CheckTripletRequest, CheckTripletResponse, VerifyGraphRequest, VerifyGraphResponse, ResolveNodesRequest, ResolveNodesResponse, GapAnalysisRequest, GapAnalysisResponse, SegmentRequest, SegmentResponse, ClassifyShapeRequest, ClassifyShapeResponse, SimpleEvalRequest, SimpleEvalResponse, ResolveNodesRequest, ResolveNodesResponse, SimpleGapRequest, SimpleGapResponse, SimpleSegmentRequest, SimpleSegmentResponse