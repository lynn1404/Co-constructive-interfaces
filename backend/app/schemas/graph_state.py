from typing import TypedDict, List, Optional

class GraphState(TypedDict):
    source_text: str
    existing_graph: List[dict]
    current_triplet: dict
    graph_type: str
    existing_nodes: List[str]

    evaluation_status: Optional[str]
    evaluation_diagnosis: Optional[str]
    duplicate_of: Optional[dict]
    predicate_note: Optional[str]

    # persisted evaluator reasoning - consumed by the corrector, and kept for debugging
    # text-side judgment
    evaluation_is_supported: Optional[bool]
    evaluation_claim_check: Optional[str]
    evaluation_direction_check: Optional[str]
    evaluation_mediator_in_text: Optional[str]
    evaluation_error_type: Optional[str]
    evaluation_better_predicate: Optional[str]
    # graph-side judgment
    evaluation_graph_path_check: Optional[str]
    evaluation_mediator_is_covered: Optional[bool]
    evaluation_graph_note: Optional[str]

    correction: Optional[List[dict]]
    correction_rationale: Optional[str]
    correction_grounding: Optional[list]  
    correction_outcome: Optional[str]     

    resolutions: Optional[list]          
    suggested_triplet: Optional[list]
    student_hint: Optional[str]
    student_reflection: Optional[str]