import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createInterview } from "../../../src/worker/lib/db/interviews";
import { addMessage, listMessages } from "../../../src/worker/lib/db/messages";
import { applyTestMigrations } from "../helpers/migrate";
import { sampleAnswerEvaluation } from "../helpers/fixtures";

beforeAll(async () => {
  await applyTestMigrations(env.DB);
});

describe("messages repository", () => {
  it("adds several messages and lists them back in insertion order", async () => {
    const interviewId = crypto.randomUUID();
    await createInterview(env.DB, { id: interviewId, cvText: "CV text" });

    const question = await addMessage(env.DB, {
      id: crypto.randomUUID(),
      interviewId,
      role: "interviewer",
      content: "Tell me about the migration.",
    });
    const answer = await addMessage(env.DB, {
      id: crypto.randomUUID(),
      interviewId,
      role: "candidate",
      content: "We moved the monolith to microservices over 18 months.",
      evaluation: sampleAnswerEvaluation,
    });
    const followUp = await addMessage(env.DB, {
      id: crypto.randomUUID(),
      interviewId,
      role: "interviewer",
      content: "What was your specific role?",
    });

    const messages = await listMessages(env.DB, interviewId);
    expect(messages.map((message) => message.id)).toEqual([question.id, answer.id, followUp.id]);
  });

  it("round-trips evaluation_json through AnswerEvaluationSchema", async () => {
    const interviewId = crypto.randomUUID();
    await createInterview(env.DB, { id: interviewId, cvText: "CV text" });

    await addMessage(env.DB, {
      id: crypto.randomUUID(),
      interviewId,
      role: "candidate",
      content: "We moved the monolith to microservices over 18 months.",
      evaluation: sampleAnswerEvaluation,
    });

    const [message] = await listMessages(env.DB, interviewId);
    expect(message?.evaluation).toEqual(sampleAnswerEvaluation);
  });

  it("leaves evaluation null when not provided", async () => {
    const interviewId = crypto.randomUUID();
    await createInterview(env.DB, { id: interviewId, cvText: "CV text" });

    await addMessage(env.DB, {
      id: crypto.randomUUID(),
      interviewId,
      role: "interviewer",
      content: "Tell me about the migration.",
    });

    const [message] = await listMessages(env.DB, interviewId);
    expect(message?.evaluation).toBeNull();
  });

  it("only returns messages for the requested interview", async () => {
    const interviewA = crypto.randomUUID();
    const interviewB = crypto.randomUUID();
    await createInterview(env.DB, { id: interviewA, cvText: "CV A" });
    await createInterview(env.DB, { id: interviewB, cvText: "CV B" });

    await addMessage(env.DB, { id: crypto.randomUUID(), interviewId: interviewA, role: "interviewer", content: "Q1" });
    await addMessage(env.DB, { id: crypto.randomUUID(), interviewId: interviewB, role: "interviewer", content: "Q2" });

    const messagesForA = await listMessages(env.DB, interviewA);
    expect(messagesForA).toHaveLength(1);
    expect(messagesForA[0]?.content).toBe("Q1");
  });
});
