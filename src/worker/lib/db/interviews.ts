import { CvAnalysisSchema, type CvAnalysis } from "../../../shared/schemas/analysis";
import { InterviewStateSchema, type InterviewState } from "../../../shared/schemas/interviewState";
import { parseOrThrow } from "../../../shared/schemas/parse";
import { nowIso } from "./shared";

export type InterviewStatus =
  | "created"
  | "analyzing"
  | "ready"
  | "in_progress"
  | "payment_required"
  | "completed"
  | "failed";

export interface Interview {
  id: string;
  email: string | null;
  cvText: string;
  jobDescription: string | null;
  analysis: CvAnalysis | null;
  interviewState: InterviewState | null;
  status: InterviewStatus;
  paid: boolean;
  freeAnswersUsed: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

interface InterviewRow {
  id: string;
  email: string | null;
  cv_text: string;
  job_description: string | null;
  analysis_json: string | null;
  interview_state_json: string | null;
  status: string;
  paid: number;
  free_answers_used: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

function mapInterviewRow(row: InterviewRow): Interview {
  return {
    id: row.id,
    email: row.email,
    cvText: row.cv_text,
    jobDescription: row.job_description,
    analysis: row.analysis_json
      ? parseOrThrow(CvAnalysisSchema, JSON.parse(row.analysis_json), "interviews.analysis_json")
      : null,
    interviewState: row.interview_state_json
      ? parseOrThrow(InterviewStateSchema, JSON.parse(row.interview_state_json), "interviews.interview_state_json")
      : null,
    status: row.status as InterviewStatus,
    paid: row.paid === 1,
    freeAnswersUsed: row.free_answers_used,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

export interface CreateInterviewParams {
  id: string;
  cvText: string;
  jobDescription?: string;
  email?: string;
}

export async function createInterview(db: D1Database, params: CreateInterviewParams): Promise<Interview> {
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO interviews (id, email, cv_text, job_description, status, paid, free_answers_used, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'created', 0, 0, ?, ?)`,
    )
    .bind(params.id, params.email ?? null, params.cvText, params.jobDescription ?? null, now, now)
    .run();

  return {
    id: params.id,
    email: params.email ?? null,
    cvText: params.cvText,
    jobDescription: params.jobDescription ?? null,
    analysis: null,
    interviewState: null,
    status: "created",
    paid: false,
    freeAnswersUsed: 0,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
}

export async function getInterview(db: D1Database, id: string): Promise<Interview | null> {
  const row = await db.prepare(`SELECT * FROM interviews WHERE id = ?`).bind(id).first<InterviewRow>();
  return row ? mapInterviewRow(row) : null;
}

export class InterviewNotFoundError extends Error {
  readonly interviewId: string;

  constructor(interviewId: string) {
    super(`No interview found with id "${interviewId}"`);
    this.name = "InterviewNotFoundError";
    this.interviewId = interviewId;
  }
}

export interface InterviewUpdate {
  analysis?: CvAnalysis;
  interviewState?: InterviewState;
  status?: InterviewStatus;
  paid?: boolean;
  freeAnswersUsed?: number;
  completedAt?: string | null;
}

/** Partial update — only fields present on `patch` are written; `updated_at` always bumps. */
export async function updateInterview(db: D1Database, id: string, patch: InterviewUpdate): Promise<Interview> {
  const setClauses: string[] = ["updated_at = ?"];
  const values: unknown[] = [nowIso()];

  if (patch.analysis !== undefined) {
    setClauses.push("analysis_json = ?");
    values.push(JSON.stringify(patch.analysis));
  }
  if (patch.interviewState !== undefined) {
    setClauses.push("interview_state_json = ?");
    values.push(JSON.stringify(patch.interviewState));
  }
  if (patch.status !== undefined) {
    setClauses.push("status = ?");
    values.push(patch.status);
  }
  if (patch.paid !== undefined) {
    setClauses.push("paid = ?");
    values.push(patch.paid ? 1 : 0);
  }
  if (patch.freeAnswersUsed !== undefined) {
    setClauses.push("free_answers_used = ?");
    values.push(patch.freeAnswersUsed);
  }
  if (patch.completedAt !== undefined) {
    setClauses.push("completed_at = ?");
    values.push(patch.completedAt);
  }

  values.push(id);
  await db
    .prepare(`UPDATE interviews SET ${setClauses.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();

  const updated = await getInterview(db, id);
  if (!updated) {
    throw new InterviewNotFoundError(id);
  }
  return updated;
}
