export interface TextHighlight {
  id: string;
  start: number;
  end: number;
  text: string;
  wordLimitExceeded?: boolean;
}

export interface Triplet {
  subject: string;
  predicate: string;
  object: string;
}


export interface CheckTripletResponse {
  graph_state: string;
  verification: {
    status: string;
    explanation: string;
    duplicate_of: string | null;
    predicate_note: string | null;
  };
  correction: {
    fixed_triplets: Triplet[];
    explanation: string;
  } | null;
  node_resolutions: Record<string, unknown>;
  suggested_triplets: Triplet[] | null;
  hint: string | null;
}

export type GraphSnapshotWireEntry =
  | {
      subject: string;
      predicate: string;
      object: string;
      verified?: boolean;
      flagged?: boolean;
      _judgment?: { justification: string | null; suggested_correction: string };
    }
  | { node: string };

export interface CheckTripletRequest {
  source_text: string;
  existing_graph: GraphSnapshotWireEntry[];
  triplet: Triplet;
}

export interface StudentVerificationEntry {
  triplet: Triplet;
  state: "verified" | "flagged" | "blocked";
  status: "correct" | "incorrect" | "incomplete" | "redundant" | null;
  error_type: "duplicate" | "unfinished_process" | "skipped_mediator" | "not_in_text" | "wrong_object" | "wrong_subject" | "wrong_subject" | "reversed_relation" | null;
  hint: string | null;
  reflection?: string | null;
  suggested_triplets: Triplet[];
}

export interface VerifyGraphRequest {
  source_text: string;
  existing_graph: GraphSnapshotWireEntry[];
}

export interface VerifyGraphResponse {
  updated_graph: Record<string, unknown>[];
  summary: Record<string, number>;
  results: Record<string, unknown>[];
  student: StudentVerificationEntry[];
}

export interface SimilarNodeGroup {
  canonical: string;
  members: string[];
  reason: string;
}

export interface ResolveNodesRequest {
  source_text: string;
  existing_graph: GraphSnapshotWireEntry[];
  threshold?: number;
}

export interface ResolveNodesResponse {
  clusters: string[][];
  groups: SimilarNodeGroup[];
  n_nodes: number;
}

export interface GapArea {
  source_span: string;
  area: string;
  nudge: string;
}

export interface GapAnalysisRequest {
  source_text: string;
  existing_graph: GraphSnapshotWireEntry[];
}

export interface GapAnalysisResponse {
  gaps: GapArea[];
  overall: string;
}

export interface SimpleGapItem {
  idea: string;
  placement: string;
}

export interface SimpleGapRequest {
  source_text: string;
  existing_graph: GraphSnapshotWireEntry[];
}

export interface SimpleGapResponse {
  gaps: SimpleGapItem[];
  overall: string;
  n_verified: number;
}

export interface SegmentedConcept {
  label: string;
  source_span: string;
}

export interface SegmentRequest {
  highlighted_text: string;
  full_text?: string | null;
}

export interface SegmentResponse {
  concepts: SegmentedConcept[];
  n_concepts: number;
}

export type SimpleSegmentRequest = SegmentRequest;
export type SimpleSegmentResponse = SegmentResponse;

export interface ChatMessage {
  role: string;
  content: string;
}

export interface ChatRequest {
  message: string;
  history: ChatMessage[];
}

export type MappableShape = "comparison" | "concept_map" | "flowchart" | "sequence";

export interface ShapeSuggestion {
  shape: MappableShape;
  reason: string;
}

export interface ChatClassification {
  is_mappable: boolean;
  shapes: ShapeSuggestion[];
  primary: MappableShape | null;
  reason: string;
  gated_by: string | null;
}

export interface ChatResponse {
  answer: string;
  classification: ChatClassification;
}