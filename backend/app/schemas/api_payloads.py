from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field

from app.schemas.agent_outputs import Gap, ExtractedConcept, MergeGroup


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str

class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = Field(default_factory=list)


class ChatResponse(BaseModel):
    answer: str
    classification: Dict[str, Any]

class ClassifyShapeRequest(BaseModel):
    answer: str = Field(description="The assistant response to assess")
    user_prompt: Optional[str] = Field(
        default=None, description="The prompt that produced it, if available"
    )
 
 
class ClassifyShapeResponse(BaseModel):
    is_mappable: bool
    shapes: List[Dict[str, Any]]        # each: {shape, reason}, primary first
    primary: Optional[Literal["concept_map", "comparison", "flowchart", "sequence"]] 
    reason: str
    gated_by: Optional[str] = None      # prefilter | knowledge | shape | null


class SimpleEvalRequest(BaseModel):
    source_text: str = Field(description="The reference text the map was built from")
    existing_graph: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="The full graph from React; edges may carry a 'verified' flag",
    )
 
 
class SimpleEvalResponse(BaseModel):
    updated_graph: List[Dict[str, Any]]
    summary: Dict[str, int]
    results: List[Dict[str, Any]]  #internal
    student: List[Dict[str, Any]]  #student


class ResolveNodesRequest(BaseModel):
    existing_graph: List[Dict[str, Any]] = Field(default_factory=list)


class ResolveNodesResponse(BaseModel):
    groups: List[MergeGroup]  
    n_nodes: int


class SimpleGapRequest(BaseModel):
    source_text: str
    existing_graph: List[Dict[str, Any]] = Field(default_factory=list)


class SimpleGapResponse(BaseModel):
    gaps: List[Gap] 
    overall: str
    n_verified: int


class SimpleSegmentRequest(BaseModel):
    highlighted_text: str = Field(description="The span the student highlighted")
    full_text: Optional[str] = Field(
        default=None,
        description="Optional surrounding passage - context for interpretation only"
    )
 
 
class SimpleSegmentResponse(BaseModel):
    concepts: List[ExtractedConcept]
    n_concepts: int


