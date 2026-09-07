import type { AiRequestType } from "../ai/client";
import { nowIso } from "./shared";

export interface AiUsageRecord {
  id: string;
  interviewId: string | null;
  requestType: AiRequestType;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
  createdAt: string;
}

interface AiUsageRow {
  id: string;
  interview_id: string | null;
  request_type: string;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost_usd: number | null;
  created_at: string;
}

function mapAiUsageRow(row: AiUsageRow): AiUsageRecord {
  return {
    id: row.id,
    interviewId: row.interview_id,
    requestType: row.request_type as AiRequestType,
    model: row.model,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    estimatedCostUsd: row.estimated_cost_usd,
    createdAt: row.created_at,
  };
}

export interface RecordAiUsageParams {
  interviewId?: string | null;
  requestType: AiRequestType;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

/** Persists one `callStructured` call's usage — the caller computes `estimatedCostUsd` via `config.ts`'s `estimateCostUsd`. */
export async function recordAiUsage(db: D1Database, params: RecordAiUsageParams): Promise<AiUsageRecord> {
  const id = crypto.randomUUID();
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO ai_usage (id, interview_id, request_type, model, input_tokens, output_tokens, estimated_cost_usd, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      params.interviewId ?? null,
      params.requestType,
      params.model,
      params.inputTokens,
      params.outputTokens,
      params.estimatedCostUsd,
      now,
    )
    .run();

  return {
    id,
    interviewId: params.interviewId ?? null,
    requestType: params.requestType,
    model: params.model,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    estimatedCostUsd: params.estimatedCostUsd,
    createdAt: now,
  };
}

export async function listAiUsageForInterview(db: D1Database, interviewId: string): Promise<AiUsageRecord[]> {
  const { results } = await db
    .prepare(`SELECT * FROM ai_usage WHERE interview_id = ? ORDER BY created_at ASC, rowid ASC`)
    .bind(interviewId)
    .all<AiUsageRow>();
  return results.map(mapAiUsageRow);
}
