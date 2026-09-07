import { Hono } from "hono";
import { z } from "zod";
import { CV_MAX_LENGTH, CV_MIN_LENGTH, JOB_DESCRIPTION_MAX_LENGTH, analyzeCv } from "../lib/ai/analyzer";
import type { AiRequestType } from "../lib/ai/client";
import { evaluateAnswer } from "../lib/ai/evaluator";
import { generateQuestion } from "../lib/ai/interviewer";
import { generateReport } from "../lib/ai/report";
import { estimateCostUsd, getModelFor } from "../lib/config";
import { recordAiUsage } from "../lib/db/aiUsage";
import { logEvent } from "../lib/db/events";
import { createInterview, getInterview, updateInterview } from "../lib/db/interviews";
import { addMessage, listMessages } from "../lib/db/messages";
import { DuplicateReportError, getReport, saveReport } from "../lib/db/reports";
import { ApiError, parseJsonBody } from "../lib/errors";
import type { AppEnv } from "../lib/honoEnv";
import { shouldCompleteInterview, selectNextClaim } from "../lib/interview/controller";
import { applyEvaluation, initInterviewState } from "../lib/interview/state";
import {
  buildRecentTranscript,
  buildReportTranscript,
  getLatestInterviewerMessage,
  parseInterviewerMessageContent,
  serializeInterviewerQuestion,
  toPublicMessage,
  toPublicQuestion,
} from "../lib/interview/transcript";

/**
 * The build plan documents CV/JD length limits (Phase 3's `analyzer.ts`) but not a
 * candidate-answer limit; this is the one new bound Phase 8 introduces itself at the
 * API boundary (build-plan §38 "input length limits" applies to every text input, not
 * just CV/JD).
 */
export const ANSWER_MAX_LENGTH = 5000;

const CreateInterviewBodySchema = z.object({
  cvText: z
    .string()
    .min(CV_MIN_LENGTH, `cvText must be at least ${CV_MIN_LENGTH} characters`)
    .max(CV_MAX_LENGTH, `cvText must be at most ${CV_MAX_LENGTH} characters`),
  jobDescription: z.string().max(JOB_DESCRIPTION_MAX_LENGTH, `jobDescription must be at most ${JOB_DESCRIPTION_MAX_LENGTH} characters`).optional(),
});

const AnswerBodySchema = z.object({
  answer: z
    .string()
    .min(1, "answer must not be empty")
    .max(ANSWER_MAX_LENGTH, `answer must be at most ${ANSWER_MAX_LENGTH} characters`),
});

const interviews = new Hono<AppEnv>();

async function recordUsage(
  db: D1Database,
  interviewId: string,
  requestType: AiRequestType,
  model: string,
  usage: { inputTokens: number; outputTokens: number },
): Promise<void> {
  await recordAiUsage(db, {
    interviewId,
    requestType,
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    estimatedCostUsd: estimateCostUsd(model, usage.inputTokens, usage.outputTokens),
  });
}

interviews.post("/", async (c) => {
  const body = await parseJsonBody(c, CreateInterviewBodySchema);
  const id = crypto.randomUUID();
  await createInterview(c.env.DB, { id, cvText: body.cvText, jobDescription: body.jobDescription });
  await logEvent(c.env.DB, id, "cv_submitted");
  return c.json({ interviewId: id });
});

interviews.get("/:id", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const interview = await getInterview(db, id);
  if (!interview) throw new ApiError(404, "NOT_FOUND", "Interview not found");

  const messages = await listMessages(db, id);
  return c.json({
    id: interview.id,
    status: interview.status,
    analysis: interview.analysis ?? undefined,
    interviewState: interview.interviewState ?? undefined,
    paid: interview.paid,
    freeAnswersUsed: interview.freeAnswersUsed,
    messages: messages.map(toPublicMessage),
  });
});

/**
 * Idempotent by construction: `interview.analysis` (not `status`) is the source of
 * truth for "already analyzed" — a second call with analysis already persisted returns
 * it directly without touching the AI, no matter what `status` string happens to be
 * (build-plan §37 "duplicate/refresh calls"). Before the first successful analysis,
 * `status` is set to `analyzing` up front so a concurrent `GET` mid-call can observe
 * it; if `analyzeCv` then throws, `status` is deliberately left at `analyzing` rather
 * than reset or marked `failed` — a recoverable state, since a retried `/analyze` call
 * still has no `analysis` and will simply try again.
 */
interviews.post("/:id/analyze", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const interview = await getInterview(db, id);
  if (!interview) throw new ApiError(404, "NOT_FOUND", "Interview not found");

  if (interview.analysis) {
    return c.json({ status: interview.status, analysis: interview.analysis });
  }

  await updateInterview(db, id, { status: "analyzing" });

  const config = c.get("config");
  const model = getModelFor(config, "analysis");
  const result = await analyzeCv(
    c.get("anthropic"),
    { cvText: interview.cvText, jobDescription: interview.jobDescription ?? undefined },
    model,
  );
  await recordUsage(db, id, "analysis", model, result.usage);
  await updateInterview(db, id, { analysis: result.data, status: "ready" });
  await logEvent(db, id, "scan_generated");

  return c.json({ status: "ready", analysis: result.data });
});

/**
 * Requires `status: "ready"`. If the interview has already started (`in_progress`,
 * `payment_required`, or `completed`), replays the latest stored question instead of
 * erroring or generating a duplicate one — the same idempotent-replay spirit as
 * `/analyze`, chosen so a client retrying a lost response doesn't corrupt state.
 */
interviews.post("/:id/start", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const interview = await getInterview(db, id);
  if (!interview) throw new ApiError(404, "NOT_FOUND", "Interview not found");

  if (interview.status !== "ready") {
    if (interview.status === "in_progress" || interview.status === "payment_required" || interview.status === "completed") {
      const messages = await listMessages(db, id);
      const latest = getLatestInterviewerMessage(messages);
      if (latest) {
        return c.json({ question: toPublicQuestion(parseInterviewerMessageContent(latest.content)), messageId: latest.id });
      }
    }
    throw new ApiError(409, "INVALID_STATE", `Cannot start interview in status "${interview.status}"`);
  }
  if (!interview.analysis) {
    throw new ApiError(500, "CORRUPTED_STATE", "Interview is ready but has no analysis");
  }

  const state = initInterviewState(interview.analysis);
  const config = c.get("config");
  const model = getModelFor(config, "interviewer");
  const result = await generateQuestion(
    c.get("anthropic"),
    { analysis: interview.analysis, state, activeClaim: undefined, recentTranscript: [] },
    model,
  );
  await recordUsage(db, id, "interviewer", model, result.usage);

  const finalState = { ...state, activeClaimId: result.data.targetClaimId };
  const messageId = crypto.randomUUID();
  await addMessage(db, { id: messageId, interviewId: id, role: "interviewer", content: serializeInterviewerQuestion(result.data) });
  await updateInterview(db, id, { interviewState: finalState, status: "in_progress" });
  await logEvent(db, id, "interview_started");

  return c.json({ question: toPublicQuestion(result.data), messageId });
});

/**
 * Duplicate-submission guard (build-plan §37): before doing anything else, if the
 * transcript's last message is already `candidate`-role, a submission for the current
 * question is already recorded (either a genuinely concurrent duplicate request, or a
 * client retry racing the still-in-flight original) — reject with 409 rather than
 * risking a second evaluation/second message for the same turn. Once the turn finishes
 * (an `interviewer` message is appended, or the interview completes), a new `/answer`
 * call is no longer seen as a duplicate.
 *
 * Free-limit/payment gating is intentionally NOT implemented here (Phase 11's job, per
 * this phase's own scope note) — every answer is always processed while `in_progress`.
 */
interviews.post("/:id/answer", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const interview = await getInterview(db, id);
  if (!interview) throw new ApiError(404, "NOT_FOUND", "Interview not found");

  if (interview.status !== "in_progress") {
    throw new ApiError(409, "INVALID_STATE", `Cannot submit an answer while interview status is "${interview.status}"`);
  }
  if (!interview.analysis || !interview.interviewState) {
    throw new ApiError(500, "CORRUPTED_STATE", "In-progress interview is missing analysis/state");
  }

  const body = await parseJsonBody(c, AnswerBodySchema);

  const messagesBefore = await listMessages(db, id);
  if (messagesBefore.at(-1)?.role === "candidate") {
    throw new ApiError(409, "ANSWER_ALREADY_SUBMITTED", "An answer is already being processed for this interview.");
  }

  const latestQuestionMessage = getLatestInterviewerMessage(messagesBefore);
  if (!latestQuestionMessage) {
    throw new ApiError(500, "CORRUPTED_STATE", "No question found to answer");
  }
  const question = parseInterviewerMessageContent(latestQuestionMessage.content);
  const claim = question.targetClaimId ? interview.analysis.claims.find((c2) => c2.id === question.targetClaimId) : undefined;

  const config = c.get("config");
  const anthropic = c.get("anthropic");
  const evaluatorModel = getModelFor(config, "evaluator");
  const evalResult = await evaluateAnswer(
    anthropic,
    { question, candidateAnswer: body.answer, claim, analysis: interview.analysis, state: interview.interviewState },
    evaluatorModel,
  );
  await recordUsage(db, id, "evaluator", evaluatorModel, evalResult.usage);

  await addMessage(db, {
    id: crypto.randomUUID(),
    interviewId: id,
    role: "candidate",
    content: body.answer,
    evaluation: evalResult.data.evaluation,
  });

  const state = applyEvaluation(interview.interviewState, {
    claimId: question.targetClaimId,
    category: claim?.category,
    evaluation: evalResult.data.evaluation,
    decision: evalResult.data.decision,
  });
  const freeAnswersUsed = interview.freeAnswersUsed + 1;

  if (shouldCompleteInterview(state, interview.analysis)) {
    await updateInterview(db, id, {
      interviewState: state,
      freeAnswersUsed,
      status: "completed",
      completedAt: new Date().toISOString(),
    });
    await logEvent(db, id, "interview_completed");
    return c.json({ completed: true });
  }

  // Checkpoint the evaluated turn before the next AI call: if `generateQuestion` below
  // throws, this state is already durable (build-plan §37 "recoverable state") — the
  // interview stays `in_progress` with the answer fully evaluated; only the next
  // question is missing (a documented known gap, see this phase's Completion Report).
  await updateInterview(db, id, { interviewState: state, freeAnswersUsed });

  let activeClaim = state.activeClaimId ? interview.analysis.claims.find((c2) => c2.id === state.activeClaimId) : undefined;
  if (!activeClaim) activeClaim = selectNextClaim(state, interview.analysis);

  const recentTranscript = buildRecentTranscript([...messagesBefore, { role: "candidate", content: body.answer }]);
  const interviewerModel = getModelFor(config, "interviewer");
  const questionResult = await generateQuestion(
    anthropic,
    { analysis: interview.analysis, state, activeClaim, recentTranscript },
    interviewerModel,
  );
  await recordUsage(db, id, "interviewer", interviewerModel, questionResult.usage);

  const finalState = { ...state, activeClaimId: questionResult.data.targetClaimId ?? state.activeClaimId };
  await addMessage(db, {
    id: crypto.randomUUID(),
    interviewId: id,
    role: "interviewer",
    content: serializeInterviewerQuestion(questionResult.data),
  });
  await updateInterview(db, id, { interviewState: finalState });
  await logEvent(db, id, "question_answered");

  return c.json({ nextQuestion: toPublicQuestion(questionResult.data), completed: false });
});

/**
 * Requires `status: "completed"`. Idempotent: an existing report is returned directly
 * (`DuplicateReportError` from a racing concurrent call is handled the same way —
 * fetch and return whatever was actually saved) rather than ever regenerating one.
 */
interviews.post("/:id/report", async (c) => {
  const db = c.env.DB;
  const id = c.req.param("id");
  const interview = await getInterview(db, id);
  if (!interview) throw new ApiError(404, "NOT_FOUND", "Interview not found");
  if (interview.status !== "completed") {
    throw new ApiError(409, "INVALID_STATE", `Cannot generate a report while interview status is "${interview.status}"`);
  }
  if (!interview.analysis || !interview.interviewState) {
    throw new ApiError(500, "CORRUPTED_STATE", "Completed interview is missing analysis/state");
  }

  const existing = await getReport(db, id);
  if (existing) {
    await logEvent(db, id, "report_viewed");
    return c.json({ report: existing });
  }

  const messages = await listMessages(db, id);
  const transcript = buildReportTranscript(messages);
  const config = c.get("config");
  const model = getModelFor(config, "report");
  const result = await generateReport(
    c.get("anthropic"),
    { analysis: interview.analysis, state: interview.interviewState, transcript },
    model,
  );
  await recordUsage(db, id, "report", model, result.usage);

  try {
    await saveReport(db, { id: crypto.randomUUID(), interviewId: id, report: result.data });
  } catch (error) {
    if (error instanceof DuplicateReportError) {
      const raced = await getReport(db, id);
      if (raced) {
        await logEvent(db, id, "report_viewed");
        return c.json({ report: raced });
      }
    }
    throw error;
  }

  await logEvent(db, id, "report_viewed");
  return c.json({ report: result.data });
});

export default interviews;
