// Client for the FastAPI backend. Every call is a JSON POST; failures become an ApiError whose
// message is safe to show to the user (the backend's {code, detail} body, see error_handling.py).
import type {
  ChatRequest,
  ChatResponse,
  ResolveNodesRequest,
  ResolveNodesResponse,
  SegmentRequest,
  SegmentResponse,
  SimpleGapRequest,
  SimpleGapResponse,
  VerifyGraphRequest,
  VerifyGraphResponse,
} from "./types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000/api";

/** An error from the backend (or the network). `message` is safe to show to the user. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** Build an ApiError from a failed response, preferring the backend's {code, detail} body. */
async function toApiError(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status})`;
  let code: string | null = null;
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") message = body.detail;
    if (typeof body?.code === "string") code = body.code;
  } catch {
    // body was not JSON (e.g. a proxy error page): keep the generic message
  }
  return new ApiError(message, res.status, code);
}

async function postJson<TReq, TRes>(path: string, body: TReq): Promise<TRes> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // fetch only throws when the request never got a response (server down, CORS, offline)
    throw new ApiError("Could not reach the server. Is the backend running?", 0, "network_error");
  }
  if (!res.ok) throw await toApiError(res);
  return res.json() as Promise<TRes>;
}

export const sendChat = (req: ChatRequest) => postJson<ChatRequest, ChatResponse>("/chat", req);

export const segmentConcepts = (req: SegmentRequest) =>
  postJson<SegmentRequest, SegmentResponse>("/simple-segment-concepts", req);

export const verifyGraph = (req: VerifyGraphRequest) =>
  postJson<VerifyGraphRequest, VerifyGraphResponse>("/simple-evaluate", req);

export const analyzeGapsSimple = (req: SimpleGapRequest) =>
  postJson<SimpleGapRequest, SimpleGapResponse>("/simple-analyze-gaps", req);

export const checkResolveNodes = (req: ResolveNodesRequest) =>
  postJson<ResolveNodesRequest, ResolveNodesResponse>("/simple-resolve-nodes", req);
