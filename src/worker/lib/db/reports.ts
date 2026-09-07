import { ReportSchema, type Report } from "../../../shared/schemas/report";
import { parseOrThrow } from "../../../shared/schemas/parse";
import { isUniqueConstraintError, nowIso } from "./shared";

/**
 * Thrown when a report already exists for the interview (`reports.interview_id` is
 * UNIQUE — a completed interview only gets one report; Phase 8 decides how/whether to
 * support regeneration).
 */
export class DuplicateReportError extends Error {
  readonly interviewId: string;

  constructor(interviewId: string) {
    super(`A report already exists for interview "${interviewId}"`);
    this.name = "DuplicateReportError";
    this.interviewId = interviewId;
  }
}

export interface SaveReportParams {
  id: string;
  interviewId: string;
  report: Report;
}

export async function saveReport(db: D1Database, params: SaveReportParams): Promise<void> {
  const now = nowIso();
  try {
    await db
      .prepare(`INSERT INTO reports (id, interview_id, report_json, created_at) VALUES (?, ?, ?, ?)`)
      .bind(params.id, params.interviewId, JSON.stringify(params.report), now)
      .run();
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new DuplicateReportError(params.interviewId);
    }
    throw error;
  }
}

export async function getReport(db: D1Database, interviewId: string): Promise<Report | null> {
  const row = await db
    .prepare(`SELECT report_json FROM reports WHERE interview_id = ?`)
    .bind(interviewId)
    .first<{ report_json: string }>();
  return row ? parseOrThrow(ReportSchema, JSON.parse(row.report_json), "reports.report_json") : null;
}
