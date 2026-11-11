from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.llms_outputs import ExtractedConcept, Gap, MergeGroup


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str

class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = Field(default_factory=list)


class ChatResponse(BaseModel):
    answer: str
    classification: dict[str, Any]

class ClassifyShapeRequest(BaseModel):
    answer: str = Field(description="The assistant response to assess")
    user_prompt: str | None = Field(
        default=None, description="The prompt that produced it, if available"
    )


class ClassifyShapeResponse(BaseModel):
    is_mappable: bool
    shapes: list[dict[str, Any]]        # each: {shape, reason}, primary first
    primary: Literal["concept_map", "comparison", "flowchart", "sequence"] | None
    reason: str
    gated_by: str | None = None      # prefilter | knowledge | shape | null


class SimpleEvalRequest(BaseModel):
    source_text: str = Field(description="The reference text the map was built from")
    existing_graph: list[dict[str, Any]] = Field(
        default_factory=list,
        description="The full graph from React; edges may carry a 'verified' flag",
    )


class SimpleEvalResponse(BaseModel):
    updated_graph: list[dict[str, Any]]
    summary: dict[str, int]
    results: list[dict[str, Any]]  #internal
    student: list[dict[str, Any]]  #student


class ResolveNodesRequest(BaseModel):
    existing_graph: list[dict[str, Any]] = Field(default_factory=list)


class ResolveNodesResponse(BaseModel):
    groups: list[MergeGroup]
    n_nodes: int


class SimpleGapRequest(BaseModel):
    source_text: str
    existing_graph: list[dict[str, Any]] = Field(default_factory=list)


class SimpleGapResponse(BaseModel):
    gaps: list[Gap]
    overall: str
    n_verified: int


class SimpleSegmentRequest(BaseModel):
    highlighted_text: str = Field(description="The span the student highlighted")
    full_text: str | None = Field(
        default=None,
        description="Optional surrounding passage - context for interpretation only"
    )


class SimpleSegmentResponse(BaseModel):
    concepts: list[ExtractedConcept]
    n_concepts: int


