import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { evaluateAnswer, type EvaluateAnswerContext } from "../../../src/worker/lib/ai/evaluator";
import { STRUCTURED_OUTPUT_TOOL_NAME } from "../../../src/worker/lib/ai/client";
import type { CvAnalysis, TechnicalClaim } from "../../../src/shared/schemas/analysis";
import type { InterviewState } from "../../../src/shared/schemas/interviewState";
import type { InterviewerResponse } from "../../../src/shared/schemas/interviewer";
import type { EvaluationAndDecision } from "../../../src/shared/schemas/evaluation";

function fakeAnthropic(create: (...args: unknown[]) => unknown): Anthropic {
  return { messages: { create: vi.fn(create) } } as unknown as Anthropic;
}

function toolUseMessage(input: unknown, usage = { input_tokens: 10, output_tokens: 5 }) {
  return {
    id: "msg_1",
    content: [{ type: "tool_use", id: "toolu_1", name: STRUCTURED_OUTPUT_TOOL_NAME, input }],
    usage,
  };
}

const kafkaClaim: TechnicalClaim = {
  id: "claim-kafka",
  text: "Designed the event backbone on Apache Kafka to decouple order processing.",
  sourceExcerpt: "Designed the event backbone on Apache Kafka to decouple order processing.",
  category: "MESSAGING",
  riskLevel: "high",
  confidence: 0.6,
  reasoning: "Worth probing for personal contribution vs. team effort.",
  likelyQuestions: ["What happens if a broker fails mid-transaction?"],
  requiredDepth: "senior",
};

const dbClaim: TechnicalClaim = {
  id: "claim-db",
  text: "Optimized a slow-running reporting query.",
  sourceExcerpt: "Optimized a slow-running reporting query.",
  category: "DATABASE",
  riskLevel: "high",
  confidence: 0.5,
  reasoning: "Generic claim, worth a follow-up.",
  likelyQuestions: ["How did you identify the bottleneck?"],
  requiredDepth: "intermediate",
};

const analysis: CvAnalysis = {
  estimatedSeniority: "senior",
  primaryStack: ["Java", "Spring Boot", "Kafka"],
  technologies: ["Java", "Spring Boot", "Kafka", "PostgreSQL"],
  projects: [],
  claims: [kafkaClaim, dbClaim],
  vagueClaims: [],
};

const state: InterviewState = {
  candidateSeniority: "senior",
  testedClaimIds: [],
  activeClaimId: "claim-kafka",
  topicScores: {},
  strongAreas: [],
  weakAreas: [],
  redFlags: [],
  contradictions: [],
  conceptsToProbe: [],
  candidatePatterns: { vagueAnswers: 0, strongConcreteAnswers: 0, excessiveWeLanguage: 0, buzzwordAnswers: 0 },
  majorQuestionsAsked: 2,
  estimatedCompletion: 0.1,
  highRiskClaimIds: ["claim-kafka", "claim-db"],
};

const question: InterviewerResponse = {
  question: "What happens if your consumer commits to PostgreSQL but crashes before committing the Kafka offset?",
  targetClaimId: "claim-kafka",
  intent: "Test understanding of at-least-once delivery and idempotency.",
  difficulty: "senior",
  expectedConcepts: ["idempotency", "offset commit ordering"],
};

const validResult: EvaluationAndDecision = {
  evaluation: {
    technicalAccuracy: 7,
    depth: 6,
    clarity: 8,
    realWorldEvidence: 6,
    specificity: 7,
    seniority: 7,
    buzzwordRisk: 2,
    strengths: ["Correctly identified the message could be redelivered."],
    weaknesses: [],
    missingConcepts: [],
    interviewerConfidence: "likely_genuine_experience",
  },
  decision: {
    action: "GO_DEEPER",
    reason: "Answer was correct but didn't explain the idempotency mechanism used.",
    shouldComplete: false,
  },
};

describe("evaluateAnswer", () => {
  it("returns the parsed EvaluationAndDecision and includes question/answer/claim context in the prompt", async () => {
    const create = vi.fn().mockResolvedValue(toolUseMessage(validResult));
    const anthropic = fakeAnthropic(create);

    const ctx: EvaluateAnswerContext = {
      question,
      candidateAnswer: "The message could be received again by the consumer.",
      claim: kafkaClaim,
      analysis,
      state,
    };
    const result = await evaluateAnswer(anthropic, ctx, "test-model");

    expect(result.data).toEqual(validResult);
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });

    const body = create.mock.calls[0]?.[0] as { system: string; messages: { content: string }[] };
    const content = body.messages[0]?.content ?? "";
    expect(content).toContain(question.question);
    expect(content).toContain("The message could be received again");
    expect(content).toContain("claim-kafka");
    expect(body.system).toContain("never invent");
  });

  it("includes untested high-risk claims (excluding the current one) so the model can pick nextTarget", async () => {
    const create = vi.fn().mockResolvedValue(toolUseMessage(validResult));
    const anthropic = fakeAnthropic(create);

    const ctx: EvaluateAnswerContext = {
      question,
      candidateAnswer: "Some answer.",
      claim: kafkaClaim,
      analysis,
      state,
    };
    await evaluateAnswer(anthropic, ctx, "test-model");

    const body = create.mock.calls[0]?.[0] as { messages: { content: string }[] };
    const content = body.messages[0]?.content ?? "";
    expect(content).toContain("<untested_high_risk_claims>");
    expect(content).toContain("claim-db");
    // The claim currently being tested shouldn't also appear in the "untested" list.
    const untestedSection = content.split("<untested_high_risk_claims>")[1] ?? "";
    expect(untestedSection).not.toContain("id: claim-kafka");
  });

  it("omits claim_being_tested when no claim is passed", async () => {
    const create = vi.fn().mockResolvedValue(toolUseMessage(validResult));
    const anthropic = fakeAnthropic(create);

    const ctx: EvaluateAnswerContext = {
      question,
      candidateAnswer: "Some answer.",
      analysis,
      state,
    };
    await evaluateAnswer(anthropic, ctx, "test-model");

    const body = create.mock.calls[0]?.[0] as { messages: { content: string }[] };
    expect(body.messages[0]?.content ?? "").not.toContain("<claim_being_tested>");
  });

  it("propagates schema validation failure for a malformed mocked response", async () => {
    const invalid = { ...validResult, evaluation: { ...validResult.evaluation, technicalAccuracy: 15 } };
    const create = vi.fn().mockResolvedValue(toolUseMessage(invalid));
    const anthropic = fakeAnthropic(create);

    const ctx: EvaluateAnswerContext = { question, candidateAnswer: "Some answer.", analysis, state };
    await expect(evaluateAnswer(anthropic, ctx, "test-model")).rejects.toThrow(/validation failed/i);
    expect(create).toHaveBeenCalledTimes(2);
  });
});
