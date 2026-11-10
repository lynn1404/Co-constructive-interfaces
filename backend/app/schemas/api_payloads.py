from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from app.schemas.agent_outputs import Triplet

class CheckTripletRequest(BaseModel):
    source_text: str = Field(description="Source text snippet for verification")
    existing_graph: List[Dict[str, Any]] = Field(
        default_factory=list, 
        description="Current graph data from React (e.g., existing triplets or node labels)"
    )
    triplet: Triplet = Field(description="Candidate triplet drawn by the user")


class CheckTripletResponse(BaseModel):
    graph_state: str
    verification: Dict[str, Any]
    correction: Optional[Dict[str, Any]] = None
    resolutions: Optional[List[Dict[str, Any]]] = None
    suggested_triplets: Optional[List[Dict[str, Any]]] = None
    hint: Optional[str] = None

class VerifyGraphRequest(BaseModel):
    source_text: str = Field(description="Source text the map is built from")
    existing_graph: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Full graph from React; edges may carry a 'verified' flag",
    )


class VerifyGraphResponse(BaseModel):
    updated_graph: List[Dict[str, Any]]   # edges that passed now carry "verified": true
    summary: Dict[str, int]
    results: List[Dict[str, Any]]          # full/internal: diagnosis, blocked_by, correction
    student: List[Dict[str, Any]]          # per-triplet: state, status, hint, suggested_triplets


class ResolveNodesRequest(BaseModel):
    existing_graph: List[Dict[str, Any]] = Field(default_factory=list)
    source_text: Optional[str] = Field(default=None, description="Optional context to disambiguate ambiguous pairs")
    threshold: Optional[float] = Field(default=None)

class ResolveNodesResponse(BaseModel):
    clusters: List[List[str]]      # raw stage-1 groupings by embedding similarity
    groups: List[Dict[str, Any]]   # each: {canonical, members, reason}
    n_nodes: int

class GapAnalysisRequest(BaseModel):
    source_text: str
    existing_graph: List[Dict[str, Any]] = Field(default_factory=list)


class GapAnalysisResponse(BaseModel):
    gaps: List[Dict[str, Any]]     # each: {area, nudge}
    overall: str
    n_edges: int


class SegmentRequest(BaseModel):
    highlighted_text: str = Field(description="The span of text the student highlighted")
    full_text: Optional[str] = Field(
        default=None,
        description="Optional surrounding passage - context for interpretation only, never extracted from"
    )
 
 
class SegmentResponse(BaseModel):
    concepts: List[Dict[str, Any]]   # each: {label, source_span}
    n_concepts: int



class ClassifyShapeRequest(BaseModel):
    answer: str = Field(description="The assistant response to assess")
    user_prompt: Optional[str] = Field(
        default=None, description="The prompt that produced it, if available"
    )
 
 
class ClassifyShapeResponse(BaseModel):
    is_mappable: bool
    shapes: List[Dict[str, Any]]        # each: {shape, reason}, primary first
    primary: Optional[str] = None       # concept_map | comparison | flowchart | sequence
    reason: str
    gated_by: Optional[str] = None      # prefilter | knowledge | shape | null


class SimpleEvalRequest(BaseModel):
    source_text: str = Field(description="The reference text the map was built from")
    existing_graph: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="The full graph from React; edges may carry a 'verified' flag",
    )
 
 
class SimpleEvalResponse(BaseModel):
    """Deliberately identical in shape to VerifyGraphResponse so the frontend can swap
    between /verify-graph and /simple-evaluate without changing how it renders."""
    updated_graph: List[Dict[str, Any]]
    summary: Dict[str, int]
    results: List[Dict[str, Any]]     # internal: justification, confidence, quote
    student: List[Dict[str, Any]]     # per-edge: state, status, reflection, hint, suggested_triplets


class ResolveNodesRequest(BaseModel):
    existing_graph: List[Dict[str, Any]] = Field(default_factory=list)


class ResolveNodesResponse(BaseModel):
    groups: List[Dict[str, Any]]   # each: {canonical, members, reason}
    n_nodes: int


class SimpleGapRequest(BaseModel):
    source_text: str
    existing_graph: List[Dict[str, Any]] = Field(default_factory=list)


class SimpleGapResponse(BaseModel):
    gaps: List[Dict[str, Any]]   # each: {idea, placement}
    overall: str
    n_verified: int


class SimpleSegmentRequest(BaseModel):
    highlighted_text: str = Field(description="The span the student highlighted")
    full_text: Optional[str] = Field(
        default=None,
        description="Optional surrounding passage - context for interpretation only"
    )
 
 
class SimpleSegmentResponse(BaseModel):
    concepts: List[Dict[str, Any]]   # each: {label, source_span}
    n_concepts: int
 