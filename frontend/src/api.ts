import type {
  CheckTripletRequest,
  CheckTripletResponse,
  VerifyGraphRequest,
  VerifyGraphResponse,
  ResolveNodesRequest,
  ResolveNodesResponse,
  GapAnalysisRequest,
  GapAnalysisResponse,
  SimpleGapRequest,
  SimpleGapResponse,
  SegmentRequest,
  SegmentResponse,
  ChatRequest,
  ChatResponse,
} from "./types";

const API_BASE = "http://localhost:8000/api";

export async function checkTriplet(req: CheckTripletRequest): Promise<CheckTripletResponse> {
  const res = await fetch(`${API_BASE}/check-triplet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`check-triplet failed (${res.status}): ${body}`);
  }

  return res.json();
}

export async function verifyGraph(req: VerifyGraphRequest): Promise<VerifyGraphResponse> {
  const res = await fetch(`${API_BASE}/simple-evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`verify-graph failed (${res.status}): ${body}`);
  }

  return res.json();
}

export async function analyzeGaps(req: GapAnalysisRequest): Promise<GapAnalysisResponse> {
  const res = await fetch(`${API_BASE}/analyze-gaps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`analyze-gaps failed (${res.status}): ${body}`);
  }

  return res.json();
}

export async function analyzeGapsSimple(req: SimpleGapRequest): Promise<SimpleGapResponse> {
  const res = await fetch(`${API_BASE}/simple-analyze-gaps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`simple-analyze-gaps failed (${res.status}): ${body}`);
  }

  return res.json();
}

export async function segmentConcepts(req: SegmentRequest): Promise<SegmentResponse> {
  const res = await fetch(`${API_BASE}/simple-segment-concepts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`simple-segment-concepts failed (${res.status}): ${body}`);
  }

  return res.json();
}

export async function sendChat(req: ChatRequest): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`chat failed (${res.status}): ${body}`);
  }

  return res.json();
}

export async function checkResolveNodes(req: ResolveNodesRequest): Promise<ResolveNodesResponse> {
  const res = await fetch(`${API_BASE}/simple-resolve-nodes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`simple-resolve-nodes failed (${res.status}): ${body}`);
  }

  return res.json();
}
