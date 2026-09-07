import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { createApp } from "../../../src/worker/index";
import type { CvAnalysis } from "../../../src/shared/schemas/analysis";
import type { EvaluationAndDecision } from "../../../src/shared/schemas/evaluation";
import type { InterviewerResponse } from "../../../src/shared/schemas/interviewer";
import type { Report } from "../../../src/shared/schemas/report";
import { addMessage, listMessages } from "../../../src/worker/lib/db/messages";
import { FakeApiError, scriptedAnthropic, toolUseMessage } from "../helpers/anthropic";
import { postJson } from "../helpers/http";
import { applyTestMigrations } from "../helpers/migrate";

function fakeAnthropic(create: ReturnType<typeof vi.fn>): Anthropic {
  return { messages: { create } } as unknown as Anthropic;
}

beforeAll(async () => {
  await applyTestMigrations(env.DB);
});

const SAMPLE_CV_TEXT =
  "Senior backend engineer with 9 years of experience. Led the migration of a monolithic order " +
  "system to microservices using Spring Boot. Built an event-driven pipeline on Kafka for order " +
  "processing. Worked extensively with PostgreSQL and AWS across several production services.";

const cvAnalysis: CvAnalysis = {
  estimatedSeniority: "senior",
  primaryStack: ["Java", "Spring Boot", "Kafka"],
  technologies: ["Java", "Spring Boot", "Kafka", "PostgreSQL", "AWS"],
  projects: [{ name: "Order Platform", description: "Migrated monolith to microservices" }],
  claims: [
    {
      id: "claim-1",
      text: "Led migration of a monolith to microservices",
      sourceExcerpt: "Led the migration of a monolithic order system to microservices using Spring Boot",
      category: "MICROSERVICES",
      riskLevel: "high",
      confidence: 0.7,
      reasoning: "Broad architectural claim, worth probing for personal contribution",
      likelyQuestions: ["What was your specific role in the migration?"],
      requiredDepth: "senior",
    },
    {
      id: "claim-2",
      text: "Built an event-driven pipeline on Kafka",
      sourceExcerpt: "Built an event-driven pipeline on Kafka for order processing",
      category: "MESSAGING",
      riskLevel: "high",
      confidence: 0.6,
      reasoning: "Common buzzword area, worth checking for depth",
      likelyQuestions: ["How do you handle consumer failures?"],
      requiredDepth: "senior",
    },
  ],
  vagueClaims: ["worked extensively with AWS"],
};

const question1: InterviewerResponse = {
  question: "Tell me about the migration — what was your specific role?",
  targetClaimId: "claim-1",
  intent: "probe personal ownership",
  difficulty: "senior",
  expectedConcepts: ["strangler fig", "personal ownership"],
};

const followUpQuestion1: InterviewerResponse = {
  question: "You keep saying 'we'. What part did you personally own?",
  targetClaimId: "claim-1",
  intent: "push past we-language",
  difficulty: "senior",
  expectedConcepts: ["personal contribution"],
};

const question2: InterviewerResponse = {
  question: "Walk me through how your Kafka consumers handle a crash mid-processing.",
  targetClaimId: "claim-2",
  intent: "probe failure handling",
  difficulty: "senior",
  expectedConcepts: ["idempotency", "offset commit ordering"],
};

const evalFollowUp: EvaluationAndDecision = {
  evaluation: {
    technicalAccuracy: 4,
    depth: 3,
    clarity: 5,
    realWorldEvidence: 3,
    specificity: 2,
    seniority: 4,
    buzzwordRisk: 6,
    strengths: [],
    weaknesses: ['excessive "we" language, unclear personal contribution'],
    missingConcepts: ["specific personal role"],
    interviewerConfidence: "surface_level",
  },
  decision: { action: "FOLLOW_UP", reason: "too vague, needs a concrete personal answer", shouldComplete: false },
};

const evalNewTopic: EvaluationAndDecision = {
  evaluation: {
    technicalAccuracy: 7,
    depth: 6,
    clarity: 7,
    realWorldEvidence: 6,
    specificity: 7,
    seniority: 7,
    buzzwordRisk: 3,
    strengths: ["clearly identified personal ownership of the payments service split"],
    weaknesses: [],
    missingConcepts: [],
    interviewerConfidence: "likely_genuine_experience",
  },
  decision: { action: "NEW_TOPIC", reason: "solid, specific answer; move to the next claim", nextTarget: "claim-2", shouldComplete: false },
};

const evalComplete: EvaluationAndDecision = {
  evaluation: {
    technicalAccuracy: 8,
    depth: 7,
    clarity: 8,
    realWorldEvidence: 7,
    specificity: 8,
    seniority: 8,
    buzzwordRisk: 2,
    strengths: ["explained idempotent consumer design correctly"],
    weaknesses: [],
    missingConcepts: [],
    interviewerConfidence: "likely_genuine_experience",
  },
  decision: { action: "INTERVIEW_COMPLETE", reason: "enough evidence gathered", shouldComplete: true },
};

const reportPayload: Report = {
  overallReadiness: 62,
  categoryScores: { MICROSERVICES: 6, MESSAGING: 7 },
  verdict: { status: "MOSTLY_READY", summary: "Vague at first on ownership, but solid once pressed; strong on Kafka failure handling." },
  claimRisk: [
    { claimId: "claim-1", label: "Microservices migration", status: "NEEDS_PRACTICE", explanation: "Initially hid behind 'we', clarified only under direct pressure." },
    { claimId: "claim-2", label: "Kafka event pipeline", status: "SAFE", explanation: "Answered concretely with correct idempotency handling." },
  ],
  redFlags: [],
  strongAreas: [{ title: "Kafka failure handling", evidence: ["Explained idempotent consumer design"], interviewerImpression: "Genuinely solid" }],
  betterAnswers: [],
  likelyFollowUpQuestions: ["What would you do differently in the migration next time?"],
  studyPriorities: [
    { priority: 1, topic: "Speaking concretely about personal ownership", estimatedMinutes: "20", reviewItems: ["Practice answering with 'I' instead of 'we'"] },
  ],
};

async function createReadyInterview(app: ReturnType<typeof createApp>): Promise<string> {
  const createRes = await postJson(app, "/api/interviews", { cvText: SAMPLE_CV_TEXT }, env);
  const { interviewId } = (await createRes.json()) as { interviewId: string };
  const analyzeRes = await postJson(app, `/api/interviews/${interviewId}/analyze`, {}, env);
  expect(analyzeRes.status).toBe(200);
  return interviewId;
}

describe("interview API routes (Phase 8)", () => {
  it("runs a full interview end-to-end: create -> analyze -> start -> answer x3 -> report", async () => {
    const { anthropic, create } = scriptedAnthropic([
      cvAnalysis, // analyze
      question1, // start
      evalFollowUp, // answer 1 (evaluator)
      followUpQuestion1, // answer 1 (next question)
      evalNewTopic, // answer 2 (evaluator)
      question2, // answer 2 (next question)
      evalComplete, // answer 3 (evaluator) -> completes, no next question
      reportPayload, // report
    ]);
    const app = createApp({ anthropicFactory: () => anthropic });

    const createRes = await postJson(app, "/api/interviews", { cvText: SAMPLE_CV_TEXT }, env);
    expect(createRes.status).toBe(200);
    const { interviewId: id } = (await createRes.json()) as { interviewId: string };
    expect(id).toBeTruthy();

    const analyzeRes = await postJson(app, `/api/interviews/${id}/analyze`, {}, env);
    expect(analyzeRes.status).toBe(200);
    const analyzeBody = (await analyzeRes.json()) as { status: string; analysis: CvAnalysis };
    expect(analyzeBody.status).toBe("ready");
    expect(analyzeBody.analysis.claims).toHaveLength(2);

    const startRes = await postJson(app, `/api/interviews/${id}/start`, {}, env);
    expect(startRes.status).toBe(200);
    const startBody = (await startRes.json()) as { question: { question: string; targetClaimId?: string }; messageId: string };
    expect(startBody.question.question).toBe(question1.question);
    expect(startBody.question.targetClaimId).toBe("claim-1");
    // Internal-only fields must never reach the candidate (Phase 5's evaluateAnswer/generateQuestion docstrings).
    expect(startBody.question).not.toHaveProperty("expectedConcepts");
    expect(startBody.question).not.toHaveProperty("intent");

    const getAfterStart = await app.request(`/api/interviews/${id}`, {}, env);
    const afterStartBody = (await getAfterStart.json()) as { status: string; messages: { role: string; content: string }[] };
    expect(afterStartBody.status).toBe("in_progress");
    expect(afterStartBody.messages).toHaveLength(1);
    expect(afterStartBody.messages[0]).toMatchObject({ role: "interviewer", content: question1.question });

    // Answer 1: vague, evaluated as FOLLOW_UP -> same claim stays active.
    const answer1Res = await postJson(app, `/api/interviews/${id}/answer`, { answer: "We handled the migration as a team." }, env);
    expect(answer1Res.status).toBe(200);
    const answer1Body = (await answer1Res.json()) as { nextQuestion: { question: string }; completed: boolean };
    expect(answer1Body.completed).toBe(false);
    expect(answer1Body.nextQuestion.question).toBe(followUpQuestion1.question);

    // Answer 2: strong and specific, evaluated as NEW_TOPIC -> moves to claim-2.
    const answer2Res = await postJson(app, `/api/interviews/${id}/answer`, { answer: "I personally split the payments service out first." }, env);
    expect(answer2Res.status).toBe(200);
    const answer2Body = (await answer2Res.json()) as { nextQuestion: { question: string }; completed: boolean };
    expect(answer2Body.completed).toBe(false);
    expect(answer2Body.nextQuestion.question).toBe(question2.question);

    // Answer 3: evaluated as INTERVIEW_COMPLETE -> no further question, interview completes.
    const answer3Res = await postJson(app, `/api/interviews/${id}/answer`, { answer: "I dedupe on the payment intent id before committing the offset." }, env);
    expect(answer3Res.status).toBe(200);
    const answer3Body = (await answer3Res.json()) as { completed: boolean };
    expect(answer3Body.completed).toBe(true);

    const getAfterComplete = await app.request(`/api/interviews/${id}`, {}, env);
    const afterCompleteBody = (await getAfterComplete.json()) as {
      status: string;
      freeAnswersUsed: number;
      messages: { role: string }[];
      interviewState: { testedClaimIds: string[]; estimatedCompletion: number };
    };
    expect(afterCompleteBody.status).toBe("completed");
    expect(afterCompleteBody.freeAnswersUsed).toBe(3);
    expect(afterCompleteBody.messages).toHaveLength(6);
    expect(afterCompleteBody.interviewState.testedClaimIds.sort()).toEqual(["claim-1", "claim-2"]);
    expect(afterCompleteBody.interviewState.estimatedCompletion).toBe(1);

    const reportRes = await postJson(app, `/api/interviews/${id}/report`, {}, env);
    expect(reportRes.status).toBe(200);
    const reportBody = (await reportRes.json()) as { report: Report };
    expect(reportBody.report.overallReadiness).toBe(62);
    expect(reportBody.report.claimRisk).toHaveLength(2);

    expect(create).toHaveBeenCalledTimes(8);
  });

  it("analyze is idempotent: a second call does not re-invoke the AI and returns the same analysis", async () => {
    const { anthropic, create } = scriptedAnthropic([cvAnalysis]);
    const app = createApp({ anthropicFactory: () => anthropic });

    const createRes = await postJson(app, "/api/interviews", { cvText: SAMPLE_CV_TEXT }, env);
    const { interviewId: id } = (await createRes.json()) as { interviewId: string };

    const first = await postJson(app, `/api/interviews/${id}/analyze`, {}, env);
    const second = await postJson(app, `/api/interviews/${id}/analyze`, {}, env);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const firstBody = (await first.json()) as { analysis: CvAnalysis };
    const secondBody = (await second.json()) as { analysis: CvAnalysis };
    expect(secondBody.analysis).toEqual(firstBody.analysis);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("rejects a second /answer call while one is already recorded for the current question (duplicate guard)", async () => {
    const { anthropic, create } = scriptedAnthropic([cvAnalysis, question1]);
    const app = createApp({ anthropicFactory: () => anthropic });
    const id = await createReadyInterview(app);
    await postJson(app, `/api/interviews/${id}/start`, {}, env);

    // Simulate a prior /answer call having already recorded the candidate's message
    // (e.g. it crashed or is still in flight) before this call's guard check runs.
    await addMessage(env.DB, {
      id: crypto.randomUUID(),
      interviewId: id,
      role: "candidate",
      content: "We handled the migration as a team.",
      evaluation: evalFollowUp.evaluation,
    });
    const messagesBefore = await listMessages(env.DB, id);

    const res = await postJson(app, `/api/interviews/${id}/answer`, { answer: "We handled the migration as a team." }, env);

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("ANSWER_ALREADY_SUBMITTED");
    // The AI was never called for this rejected duplicate, and no extra message was written.
    expect(create).toHaveBeenCalledTimes(2); // analyze + start only
    const messagesAfter = await listMessages(env.DB, id);
    expect(messagesAfter).toHaveLength(messagesBefore.length);
  });

  it("report requested before completion returns a 4xx error", async () => {
    const { anthropic } = scriptedAnthropic([cvAnalysis, question1]);
    const app = createApp({ anthropicFactory: () => anthropic });
    const id = await createReadyInterview(app);
    await postJson(app, `/api/interviews/${id}/start`, {}, env);

    const res = await postJson(app, `/api/interviews/${id}/report`, {}, env);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_STATE");
  });

  it("report requested twice returns the same stored report; the AI is invoked only once", async () => {
    const { anthropic, create } = scriptedAnthropic([cvAnalysis, question1, evalComplete, reportPayload]);
    const app = createApp({ anthropicFactory: () => anthropic });
    const id = await createReadyInterview(app);
    await postJson(app, `/api/interviews/${id}/start`, {}, env);
    await postJson(app, `/api/interviews/${id}/answer`, { answer: "I dedupe on the payment intent id." }, env);

    const first = await postJson(app, `/api/interviews/${id}/report`, {}, env);
    const second = await postJson(app, `/api/interviews/${id}/report`, {}, env);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const firstBody = (await first.json()) as { report: Report };
    const secondBody = (await second.json()) as { report: Report };
    expect(secondBody.report).toEqual(firstBody.report);
    // analyze + start + answer(evaluator only, interview completes) + report = 4 calls total,
    // regardless of how many times /report itself is called.
    expect(create).toHaveBeenCalledTimes(4);
  });

  it("rejects a missing or too-short cvText with 400", async () => {
    const { anthropic } = scriptedAnthropic([]);
    const app = createApp({ anthropicFactory: () => anthropic });

    const missing = await postJson(app, "/api/interviews", {}, env);
    expect(missing.status).toBe(400);
    const missingBody = (await missing.json()) as { error: { code: string } };
    expect(missingBody.error.code).toBe("VALIDATION_ERROR");

    const tooShort = await postJson(app, "/api/interviews", { cvText: "too short" }, env);
    expect(tooShort.status).toBe(400);
  });

  it("returns 404 for an unknown interview id on every :id route", async () => {
    const { anthropic } = scriptedAnthropic([]);
    const app = createApp({ anthropicFactory: () => anthropic });
    const unknownId = crypto.randomUUID();

    const getRes = await app.request(`/api/interviews/${unknownId}`, {}, env);
    expect(getRes.status).toBe(404);

    const analyzeRes = await postJson(app, `/api/interviews/${unknownId}/analyze`, {}, env);
    expect(analyzeRes.status).toBe(404);

    const startRes = await postJson(app, `/api/interviews/${unknownId}/start`, {}, env);
    expect(startRes.status).toBe(404);

    const answerRes = await postJson(app, `/api/interviews/${unknownId}/answer`, { answer: "hi" }, env);
    expect(answerRes.status).toBe(404);

    const reportRes = await postJson(app, `/api/interviews/${unknownId}/report`, {}, env);
    expect(reportRes.status).toBe(404);

    for (const res of [getRes, analyzeRes, startRes, answerRes, reportRes]) {
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("NOT_FOUND");
    }
  });

  it("a simulated AI failure on /analyze returns 502 and leaves the interview in a recoverable state", async () => {
    const create = vi.fn().mockRejectedValueOnce(new FakeApiError(400)).mockResolvedValueOnce(toolUseMessage(cvAnalysis));
    const app = createApp({ anthropicFactory: () => fakeAnthropic(create) });

    const createRes = await postJson(app, "/api/interviews", { cvText: SAMPLE_CV_TEXT }, env);
    const { interviewId: id } = (await createRes.json()) as { interviewId: string };

    const failedAnalyze = await postJson(app, `/api/interviews/${id}/analyze`, {}, env);
    expect(failedAnalyze.status).toBe(502);
    const failedBody = (await failedAnalyze.json()) as { error: { code: string } };
    expect(failedBody.error.code).toBe("AI_UPSTREAM_ERROR");

    const afterFailure = await app.request(`/api/interviews/${id}`, {}, env);
    const afterFailureBody = (await afterFailure.json()) as { status: string; analysis?: CvAnalysis };
    // Recoverable: status reflects the attempt (not "failed"/"completed"), analysis is
    // still absent, and a retry (the mock's second, successful response) works.
    expect(afterFailureBody.status).toBe("analyzing");
    expect(afterFailureBody.analysis).toBeUndefined();

    const retryAnalyze = await postJson(app, `/api/interviews/${id}/analyze`, {}, env);
    expect(retryAnalyze.status).toBe(200);
  });

  it("a simulated AI failure on /answer returns 502 and the interview stays in_progress", async () => {
    const { anthropic: setupAnthropic } = scriptedAnthropic([cvAnalysis, question1]);
    const app = createApp({ anthropicFactory: () => setupAnthropic });
    const id = await createReadyInterview(app);
    await postJson(app, `/api/interviews/${id}/start`, {}, env);

    const failingCreate = vi.fn().mockRejectedValue(new FakeApiError(400));
    const failingApp = createApp({ anthropicFactory: () => fakeAnthropic(failingCreate) });

    const res = await postJson(failingApp, `/api/interviews/${id}/answer`, { answer: "We handled it as a team." }, env);
    expect(res.status).toBe(502);

    const after = await app.request(`/api/interviews/${id}`, {}, env);
    const afterBody = (await after.json()) as { status: string; messages: unknown[] };
    expect(afterBody.status).toBe("in_progress");
    // The evaluator call itself failed before anything was written for this turn.
    expect(afterBody.messages).toHaveLength(1);
  });
});
