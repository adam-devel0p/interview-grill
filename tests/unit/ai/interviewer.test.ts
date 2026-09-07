import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import {
  generateQuestion,
  RECENT_TRANSCRIPT_WINDOW,
  type GenerateQuestionContext,
  type TranscriptTurn,
} from "../../../src/worker/lib/ai/interviewer";
import { STRUCTURED_OUTPUT_TOOL_NAME } from "../../../src/worker/lib/ai/client";
import type { CvAnalysis, TechnicalClaim } from "../../../src/shared/schemas/analysis";
import type { InterviewState } from "../../../src/shared/schemas/interviewState";
import type { InterviewerResponse } from "../../../src/shared/schemas/interviewer";

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

const otherClaim: TechnicalClaim = {
  id: "claim-db",
  text: "Optimized a slow-running reporting query.",
  sourceExcerpt: "Optimized a slow-running reporting query.",
  category: "DATABASE",
  riskLevel: "medium",
  confidence: 0.5,
  reasoning: "Generic claim, worth a follow-up.",
  likelyQuestions: ["How did you identify the bottleneck?"],
  requiredDepth: "intermediate",
};

const analysis: CvAnalysis = {
  estimatedSeniority: "senior",
  yearsExperienceEstimate: 10,
  primaryStack: ["Java", "Spring Boot", "Kafka"],
  technologies: ["Java", "Spring Boot", "Kafka", "PostgreSQL"],
  projects: [{ name: "Order processing migration", description: "Monolith to microservices." }],
  claims: [kafkaClaim, otherClaim],
  vagueClaims: [],
};

const state: InterviewState = {
  candidateSeniority: "senior",
  testedClaimIds: [],
  activeClaimId: undefined,
  topicScores: {},
  strongAreas: [],
  weakAreas: [],
  redFlags: [],
  contradictions: [],
  conceptsToProbe: [],
  candidatePatterns: { vagueAnswers: 0, strongConcreteAnswers: 0, excessiveWeLanguage: 0, buzzwordAnswers: 0 },
  majorQuestionsAsked: 0,
  estimatedCompletion: 0,
  highRiskClaimIds: ["claim-kafka"],
};

const validQuestion: InterviewerResponse = {
  question: "What happens if your consumer commits to PostgreSQL but crashes before committing the Kafka offset?",
  targetClaimId: "claim-kafka",
  intent: "Test understanding of at-least-once delivery and idempotency.",
  difficulty: "senior",
  expectedConcepts: ["idempotency", "offset commit ordering"],
};

describe("generateQuestion", () => {
  it("returns the parsed InterviewerResponse and includes the active claim in the prompt", async () => {
    const create = vi.fn().mockResolvedValue(toolUseMessage(validQuestion));
    const anthropic = fakeAnthropic(create);

    const ctx: GenerateQuestionContext = { analysis, state, activeClaim: kafkaClaim, recentTranscript: [] };
    const result = await generateQuestion(anthropic, ctx, "test-model");

    expect(result.data).toEqual(validQuestion);
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });

    const body = create.mock.calls[0]?.[0] as { system: string; messages: { content: string }[] };
    expect(body.messages[0]?.content).toContain("claim-kafka");
    expect(body.messages[0]?.content).toContain("Apache Kafka");
    expect(body.system).toContain("Great answer");
  });

  it("sends only the last RECENT_TRANSCRIPT_WINDOW transcript turns, not the full history", async () => {
    const create = vi.fn().mockResolvedValue(toolUseMessage(validQuestion));
    const anthropic = fakeAnthropic(create);

    const fullTranscript: TranscriptTurn[] = Array.from({ length: RECENT_TRANSCRIPT_WINDOW + 4 }, (_, i) => ({
      role: i % 2 === 0 ? "interviewer" : "candidate",
      content: `turn-${i}`,
    }));

    const ctx: GenerateQuestionContext = {
      analysis,
      state,
      activeClaim: kafkaClaim,
      recentTranscript: fullTranscript,
    };
    await generateQuestion(anthropic, ctx, "test-model");

    const body = create.mock.calls[0]?.[0] as { messages: { content: string }[] };
    const content = body.messages[0]?.content ?? "";
    expect(content).not.toContain("turn-0");
    expect(content).not.toContain("turn-1");
    expect(content).not.toContain("turn-2");
    expect(content).not.toContain("turn-3");
    for (let i = fullTranscript.length - RECENT_TRANSCRIPT_WINDOW; i < fullTranscript.length; i++) {
      expect(content).toContain(`turn-${i}`);
    }
  });

  it("lists untested claims and omits current_focus_claim when there is no active claim", async () => {
    const create = vi.fn().mockResolvedValue(toolUseMessage({ ...validQuestion, targetClaimId: "claim-db" }));
    const anthropic = fakeAnthropic(create);

    const ctx: GenerateQuestionContext = { analysis, state, recentTranscript: [] };
    await generateQuestion(anthropic, ctx, "test-model");

    const body = create.mock.calls[0]?.[0] as { messages: { content: string }[] };
    const content = body.messages[0]?.content ?? "";
    expect(content).not.toContain("<current_focus_claim>");
    expect(content).toContain("<untested_claims>");
    expect(content).toContain("claim-kafka");
    expect(content).toContain("claim-db");
  });

  it("backfills targetClaimId from the active claim when the model omits it", async () => {
    const { targetClaimId: _omit, ...withoutTarget } = validQuestion;
    const create = vi.fn().mockResolvedValue(toolUseMessage(withoutTarget));
    const anthropic = fakeAnthropic(create);

    const ctx: GenerateQuestionContext = { analysis, state, activeClaim: kafkaClaim, recentTranscript: [] };
    const result = await generateQuestion(anthropic, ctx, "test-model");

    expect(result.data.targetClaimId).toBe("claim-kafka");
  });

  it("propagates schema validation failure for a malformed mocked response", async () => {
    const create = vi.fn().mockResolvedValue(toolUseMessage({ ...validQuestion, difficulty: "expert" }));
    const anthropic = fakeAnthropic(create);

    const ctx: GenerateQuestionContext = { analysis, state, activeClaim: kafkaClaim, recentTranscript: [] };
    await expect(generateQuestion(anthropic, ctx, "test-model")).rejects.toThrow(/validation failed/i);
    expect(create).toHaveBeenCalledTimes(2);
  });
});
