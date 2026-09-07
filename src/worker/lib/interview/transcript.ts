import { InterviewerResponseSchema, type InterviewerResponse } from "../../../shared/schemas/interviewer";
import { parseOrThrow } from "../../../shared/schemas/parse";
import type { TranscriptTurn } from "../ai/interviewer";
import type { ReportTranscriptTurn } from "../ai/report";
import type { Message } from "../db/messages";

/**
 * `messages.content` (Section 4.7) is untyped TEXT. This module is the single place
 * that decides its encoding: an `interviewer`-role message stores the full
 * JSON-serialized `InterviewerResponse` (the spoken question plus internal grading
 * metadata — `targetClaimId`/`intent`/`difficulty`/`expectedConcepts` — which
 * `evaluateAnswer` needs verbatim on the next turn), while a `candidate`-role message
 * stores the raw answer text as-is. Every route handler goes through these helpers
 * rather than inlining `JSON.parse`/`JSON.stringify` on message content.
 */

export function serializeInterviewerQuestion(question: InterviewerResponse): string {
  return JSON.stringify(question);
}

export function parseInterviewerMessageContent(content: string): InterviewerResponse {
  return parseOrThrow(InterviewerResponseSchema, JSON.parse(content), "messages.content(interviewer)");
}

/**
 * The candidate-safe subset of `InterviewerResponse`. Section 4.8's API contract table
 * types the `/start` and `/answer` question fields as the full `InterviewerResponse`,
 * but `expectedConcepts` (the internal grading rubric) and `intent` (the interviewer's
 * private reasoning) must never reach the candidate mid-interview — see
 * `generateQuestion`'s docstring (Phase 5, `interviewer.ts`): "this field is used only
 * for internal grading, never shown to the candidate." Phase 8 narrows the contract
 * accordingly rather than trusting the client to hide fields it was handed.
 */
export interface PublicInterviewerResponse {
  question: string;
  targetClaimId?: string;
  difficulty: InterviewerResponse["difficulty"];
}

export function toPublicQuestion(question: InterviewerResponse): PublicInterviewerResponse {
  return {
    question: question.question,
    targetClaimId: question.targetClaimId,
    difficulty: question.difficulty,
  };
}

export interface PublicMessage {
  id: string;
  role: Message["role"];
  content: string;
  createdAt: string;
}

/**
 * Maps a stored message to its candidate-safe API shape for `GET /api/interviews/:id`.
 * Interviewer content is narrowed to just the spoken question text; candidate content
 * passes through as-is. `evaluation` is never exposed here — it is internal-only (see
 * `evaluateAnswer`'s docstring); only the final report (Phase 6) surfaces a curated
 * summary of interview performance.
 */
export function toPublicMessage(message: Message): PublicMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.role === "interviewer" ? parseInterviewerMessageContent(message.content).question : message.content,
    createdAt: message.createdAt,
  };
}

/** Builds the plain-dialogue transcript `generateQuestion` expects (Phase 5) from stored messages. */
export function buildRecentTranscript(messages: Pick<Message, "role" | "content">[]): TranscriptTurn[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.role === "interviewer" ? parseInterviewerMessageContent(message.content).question : message.content,
  }));
}

/**
 * Builds `generateReport`'s transcript (Phase 6) by pairing each interviewer question
 * with the candidate answer — and its stored evaluation — that immediately follows it.
 * A candidate message with no evaluation (shouldn't happen via the normal `/answer`
 * flow, which always evaluates before storing) is skipped rather than passed through
 * with a fabricated evaluation.
 */
export function buildReportTranscript(messages: Message[]): ReportTranscriptTurn[] {
  const turns: ReportTranscriptTurn[] = [];
  for (let i = 0; i < messages.length - 1; i++) {
    const questionMessage = messages[i]!;
    const answerMessage = messages[i + 1]!;
    if (questionMessage.role === "interviewer" && answerMessage.role === "candidate" && answerMessage.evaluation) {
      turns.push({
        question: parseInterviewerMessageContent(questionMessage.content),
        answer: answerMessage.content,
        evaluation: answerMessage.evaluation,
      });
    }
  }
  return turns;
}

/** Latest `interviewer`-role message in a transcript, if any — the "current question." */
export function getLatestInterviewerMessage(messages: Message[]): Message | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === "interviewer") return messages[i];
  }
  return undefined;
}
