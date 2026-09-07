import { AnswerEvaluationSchema, type AnswerEvaluation } from "../../../shared/schemas/evaluation";
import { parseOrThrow } from "../../../shared/schemas/parse";
import { nowIso } from "./shared";

export type MessageRole = "interviewer" | "candidate";

export interface Message {
  id: string;
  interviewId: string;
  role: MessageRole;
  content: string;
  evaluation: AnswerEvaluation | null;
  createdAt: string;
}

interface MessageRow {
  id: string;
  interview_id: string;
  role: string;
  content: string;
  evaluation_json: string | null;
  created_at: string;
}

function mapMessageRow(row: MessageRow): Message {
  return {
    id: row.id,
    interviewId: row.interview_id,
    role: row.role as MessageRole,
    content: row.content,
    evaluation: row.evaluation_json
      ? parseOrThrow(AnswerEvaluationSchema, JSON.parse(row.evaluation_json), "messages.evaluation_json")
      : null,
    createdAt: row.created_at,
  };
}

export interface AddMessageParams {
  id: string;
  interviewId: string;
  role: MessageRole;
  content: string;
  evaluation?: AnswerEvaluation;
}

export async function addMessage(db: D1Database, params: AddMessageParams): Promise<Message> {
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO messages (id, interview_id, role, content, evaluation_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      params.id,
      params.interviewId,
      params.role,
      params.content,
      params.evaluation ? JSON.stringify(params.evaluation) : null,
      now,
    )
    .run();

  return {
    id: params.id,
    interviewId: params.interviewId,
    role: params.role,
    content: params.content,
    evaluation: params.evaluation ?? null,
    createdAt: now,
  };
}

/** Returns messages for `interviewId` in insertion order (`rowid` breaks timestamp ties). */
export async function listMessages(db: D1Database, interviewId: string): Promise<Message[]> {
  const { results } = await db
    .prepare(`SELECT * FROM messages WHERE interview_id = ? ORDER BY created_at ASC, rowid ASC`)
    .bind(interviewId)
    .all<MessageRow>();
  return results.map(mapMessageRow);
}
