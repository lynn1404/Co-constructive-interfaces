from app.schemas.agent_outputs import (
    ShapeClassification, 
    ShapeOption, 
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
from app.schemas.api_payloads import (ChatRequest,
                                      ChatResponse,
                                      ResolveNodesRequest, 
                                      ResolveNodesResponse, 
                                      ClassifyShapeRequest, 
                                      ClassifyShapeResponse, 
                                      SimpleEvalRequest, 
                                      SimpleEvalResponse, 
                                      SimpleGapRequest, 
                                      SimpleGapResponse, 
                                      SimpleSegmentRequest, 
                                      SimpleSegmentResponse)