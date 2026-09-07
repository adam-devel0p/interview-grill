import type { CvAnalysis, InterviewState, Report } from "../../shared/types";

/**
 * Client-side counterpart to Section 4.8's API contract. Response/request bodies reuse
 * `src/shared` types wherever a shape is already defined there (`CvAnalysis`,
 * `InterviewState`, `Report`); the few shapes that only exist as narrowed,
 * candidate-safe worker-internal types (`PublicInterviewerResponse`/`PublicMessage` in
 * `src/worker/lib/interview/transcript.ts`) are re-declared here instead of imported,
 * since importing worker code into the client bundle would pull in server-only
 * dependencies (D1, the Anthropic SDK) — the shapes themselves are simple and part of
 * the public HTTP contract, not internal implementation detail.
 */

export type InterviewStatus =
  | "created"
  | "analyzing"
  | "ready"
  | "in_progress"
  | "payment_required"
  | "completed"
  | "failed";

export type MessageRole = "interviewer" | "candidate";

export interface ApiQuestion {
  question: string;
  targetClaimId?: string;
  difficulty: "basic" | "intermediate" | "senior";
}

export interface ApiMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
}

export interface InterviewDetail {
  id: string;
  status: InterviewStatus;
  analysis?: CvAnalysis;
  interviewState?: InterviewState;
  paid: boolean;
  freeAnswersUsed: number;
  messages: ApiMessage[];
}

export interface ApiErrorShape {
  code: string;
  message: string;
  fields?: { path: string; message: string }[];
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: ApiErrorShape["fields"];

  constructor(status: number, body: ApiErrorShape) {
    super(body.message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = body.code;
    this.fields = body.fields;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const errorShape = (body as { error?: ApiErrorShape } | undefined)?.error ?? {
      code: "UNKNOWN_ERROR",
      message: "Something went wrong. Please try again.",
    };
    throw new ApiClientError(response.status, errorShape);
  }
  return body as T;
}

export function createInterview(input: { cvText: string; jobDescription?: string }): Promise<{ interviewId: string }> {
  return request("/api/interviews", { method: "POST", body: JSON.stringify(input) });
}

export function getInterview(id: string): Promise<InterviewDetail> {
  return request(`/api/interviews/${id}`);
}

export function analyzeInterview(id: string): Promise<{ status: InterviewStatus; analysis: CvAnalysis }> {
  return request(`/api/interviews/${id}/analyze`, { method: "POST" });
}

export function startInterview(id: string): Promise<{ question: ApiQuestion; messageId: string }> {
  return request(`/api/interviews/${id}/start`, { method: "POST" });
}

export function submitAnswer(
  id: string,
  answer: string,
): Promise<{ nextQuestion?: ApiQuestion; completed: boolean; paymentRequired?: boolean }> {
  return request(`/api/interviews/${id}/answer`, { method: "POST", body: JSON.stringify({ answer }) });
}

export function getReport(id: string): Promise<{ report: Report }> {
  return request(`/api/interviews/${id}/report`, { method: "POST" });
}

/**
 * build-plan §43's analytics events land through a dedicated `/api/events` endpoint
 * that doesn't exist yet — that's Phase 13's job. Call sites that want to fire an
 * event (e.g. `landing_view`) can wire up to this now; until Phase 13 lands, it's a
 * documented no-op rather than a 404 network call.
 */
export function trackEvent(_eventName: string, _metadata?: Record<string, unknown>): void {
  // no-op until Phase 13 adds a public events endpoint
}
