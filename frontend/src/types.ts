// Shapes of the data exchanged with the backend (mirrors backend/app/schemas/api_payloads.py).
import type { GraphSnapshotEntry } from "./utils/buildGraphSnapshot";

export type HighlightMode = "concepts" | "phrases";

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

export interface StudentVerificationEntry {
  triplet: Triplet;
  state: "verified" | "flagged";
  status: "incorrect" | "not_evaluated" | null;
  hint: string | null;
  suggested_triplets: Triplet[];
}


export interface VerifyGraphRequest {
  source_text: string;
  existing_graph: GraphSnapshotEntry[];
}

export interface VerifyGraphResponse {
  updated_graph: Record<string, unknown>[];
  summary: Record<string, number>;
  results: Record<string, unknown>[];
  student: StudentVerificationEntry[];
}

// ---- Similar nodes (/simple-resolve-nodes)
export interface SimilarNodeGroup {
  members: string[];
  reason: string;
}

export interface ResolveNodesRequest {
  existing_graph: GraphSnapshotEntry[];
}

export interface ResolveNodesResponse {
  groups: SimilarNodeGroup[];
  n_nodes: number;
}

// ---- Gap analysis (/simple-analyze-gaps)
export interface SimpleGapItem {
  idea: string;
  placement: string;
}

export interface SimpleGapRequest {
  source_text: string;
  existing_graph: GraphSnapshotEntry[];
}

export interface SimpleGapResponse {
  gaps: SimpleGapItem[];
  overall: string;
  n_verified: number;
}

// ---- Segmentation (/simple-segment-concepts)
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

// ---- Chat (/chat)
export interface ChatMessage {
  role: "user" | "assistant";
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
