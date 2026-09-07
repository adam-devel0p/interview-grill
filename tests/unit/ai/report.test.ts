import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { generateReport, type GenerateReportContext, type ReportTranscriptTurn } from "../../../src/worker/lib/ai/report";
import { STRUCTURED_OUTPUT_TOOL_NAME } from "../../../src/worker/lib/ai/client";
import type { CvAnalysis, TechnicalClaim } from "../../../src/shared/schemas/analysis";
import type { InterviewState } from "../../../src/shared/schemas/interviewState";
import type { InterviewerResponse } from "../../../src/shared/schemas/interviewer";
import type { AnswerEvaluation } from "../../../src/shared/schemas/evaluation";
import type { Report } from "../../../src/shared/schemas/report";

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

const awsClaim: TechnicalClaim = {
  id: "claim-aws",
  text: "We used AWS extensively across the platform.",
  sourceExcerpt: "We used AWS extensively across the platform.",
  category: "CLOUD",
  riskLevel: "high",
  confidence: 0.3,
  reasoning: "Vague, likely shallow.",
  likelyQuestions: ["Name one specific AWS service you configured yourself."],
  requiredDepth: "intermediate",
};

const untestedClaim: TechnicalClaim = {
  id: "claim-untested",
  text: "Led a team of five engineers.",
  sourceExcerpt: "Led a team of five engineers.",
  category: "LEADERSHIP",
  riskLevel: "high",
  confidence: 0.5,
  reasoning: "Never reached in this interview.",
  likelyQuestions: ["How did you handle a disagreement on the team?"],
  requiredDepth: "senior",
};

const analysisNoJd: CvAnalysis = {
  estimatedSeniority: "senior",
  primaryStack: ["Java", "Spring Boot", "Kafka"],
  technologies: ["Java", "Spring Boot", "Kafka", "PostgreSQL", "AWS"],
  projects: [],
  claims: [kafkaClaim, awsClaim, untestedClaim],
  vagueClaims: ["improved performance"],
};

const analysisWithJd: CvAnalysis = {
  ...analysisNoJd,
  jobMatch: {
    roleMatchScore: 80,
    requiredTechnologies: ["Kafka", "AWS"],
    strongMatches: ["Kafka"],
    partialMatches: ["AWS"],
    gaps: [],
    skillsMaybeNotDeepEnough: ["AWS"],
    interviewPriorities: ["Probe AWS depth"],
  },
};

const kafkaEvaluation: AnswerEvaluation = {
  technicalAccuracy: 8,
  depth: 7,
  clarity: 8,
  realWorldEvidence: 7,
  specificity: 8,
  seniority: 8,
  buzzwordRisk: 2,
  strengths: ["Correctly explained idempotent dedupe-key upsert."],
  weaknesses: [],
  missingConcepts: [],
  interviewerConfidence: "likely_genuine_experience",
};

const awsEvaluation: AnswerEvaluation = {
  technicalAccuracy: 3,
  depth: 2,
  clarity: 4,
  realWorldEvidence: 2,
  specificity: 2,
  seniority: 3,
  buzzwordRisk: 8,
  strengths: [],
  weaknesses: ['excessive "we" language with unclear personal contribution', "no concrete service named"],
  missingConcepts: ["specific AWS service configuration"],
  redFlag: "Could not name a single AWS service despite repeated prompting.",
  interviewerConfidence: "surface_level",
};

const kafkaQuestion: InterviewerResponse = {
  question: "How did your settlement consumer avoid double-charging on crash-before-commit?",
  targetClaimId: "claim-kafka",
  intent: "Test idempotency mechanism understanding.",
  difficulty: "senior",
  expectedConcepts: ["idempotency", "dedupe key"],
};

const awsQuestion: InterviewerResponse = {
  question: "Name one specific AWS service you personally configured, and one setting you tuned.",
  targetClaimId: "claim-aws",
  intent: "Test for genuine personal AWS depth vs. buzzword use.",
  difficulty: "intermediate",
  expectedConcepts: ["specific service", "concrete setting"],
};

const transcript: ReportTranscriptTurn[] = [
  { question: kafkaQuestion, answer: "I used the payment intent id as a dedupe key with ON CONFLICT DO NOTHING.", evaluation: kafkaEvaluation },
  { question: awsQuestion, answer: "We used AWS across the board, it's hard to pick one.", evaluation: awsEvaluation },
];

const state: InterviewState = {
  candidateSeniority: "senior",
  testedClaimIds: ["claim-kafka", "claim-aws"],
  activeClaimId: undefined,
  topicScores: { MESSAGING: 7.6, CLOUD: 2.4 },
  strongAreas: ["Kafka exactly-once settlement pipeline"],
  weakAreas: ["AWS depth"],
  redFlags: ["Could not name a single AWS service despite repeated prompting."],
  contradictions: [],
  conceptsToProbe: [],
  candidatePatterns: { vagueAnswers: 1, strongConcreteAnswers: 1, excessiveWeLanguage: 1, buzzwordAnswers: 1 },
  majorQuestionsAsked: 2,
  estimatedCompletion: 0.95,
  highRiskClaimIds: ["claim-kafka", "claim-aws", "claim-untested"],
};

const validReportNoJd: Report = {
  overallReadiness: 55,
  categoryScores: { MESSAGING: 8, CLOUD: 2 },
  verdict: { status: "MOSTLY_READY", summary: "Strong on Kafka internals, weak and evasive on AWS specifics." },
  claimRisk: [
    { claimId: "claim-kafka", label: "Kafka exactly-once settlement", status: "SAFE", explanation: "Concrete, correct mechanism explained." },
    { claimId: "claim-aws", label: "AWS platform usage", status: "HIGH_RISK", explanation: "Could not name a single service." },
  ],
  redFlags: [
    {
      title: "Could not substantiate AWS claim",
      description: "Repeated prompting for one specific service and setting produced no concrete answer.",
      interviewerConclusion: "The AWS claim is likely overstated or secondhand.",
      conceptsToRevise: ["AWS core services"],
    },
  ],
  strongAreas: [
    {
      title: "Kafka exactly-once processing",
      evidence: ["Explained dedupe-key upsert before offset commit."],
      interviewerImpression: "Genuine, hands-on understanding.",
    },
  ],
  betterAnswers: [
    {
      question: awsQuestion.question,
      candidateAnswer: "We used AWS across the board, it's hard to pick one.",
      whyWeak: "No concrete service or setting named despite a direct request.",
      strongerAnswerStructure: ["Name the specific service", "Describe a setting you personally tuned", "Explain why it mattered"],
      isExample: true,
    },
  ],
  likelyFollowUpQuestions: ["What IAM permissions did your services use?"],
  studyPriorities: [
    { priority: 1, topic: "AWS core services", estimatedMinutes: "45", reviewItems: ["EC2", "RDS", "IAM"], note: "You could not name a single service — this needs real hands-on review, not just CV rewording." },
  ],
};

describe("generateReport", () => {
  it("returns the parsed Report and includes tested-claim and transcript context in the prompt", async () => {
    const create = vi.fn().mockResolvedValue(toolUseMessage(validReportNoJd));
    const anthropic = fakeAnthropic(create);

    const ctx: GenerateReportContext = { analysis: analysisNoJd, state, transcript };
    const result = await generateReport(anthropic, ctx, "test-model");

    expect(result.data).toEqual(validReportNoJd);
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });

    const body = create.mock.calls[0]?.[0] as { system: string; messages: { content: string }[] };
    const content = body.messages[0]?.content ?? "";
    expect(content).toContain("claim-kafka");
    expect(content).toContain("claim-aws");
    expect(content).toContain("dedupe key");
    expect(content).toContain("<tested_claim_ids>");
    expect(body.system).toContain("never invent");
  });

  it("lists untested high-risk claims separately and instructs not to score them", async () => {
    const create = vi.fn().mockResolvedValue(toolUseMessage(validReportNoJd));
    const anthropic = fakeAnthropic(create);

    const ctx: GenerateReportContext = { analysis: analysisNoJd, state, transcript };
    await generateReport(anthropic, ctx, "test-model");

    const body = create.mock.calls[0]?.[0] as { messages: { content: string }[] };
    const content = body.messages[0]?.content ?? "";
    expect(content).toContain("<untested_high_risk_claims>");
    expect(content).toContain("claim-untested");
    const untestedSection = content.split("<untested_high_risk_claims>")[1]?.split("</untested_high_risk_claims>")[0] ?? "";
    expect(untestedSection).not.toContain("id: claim-kafka");
  });

  it("includes roleFit instructions and job match context only when a job description was supplied", async () => {
    const create = vi.fn().mockResolvedValue(
      toolUseMessage({
        ...validReportNoJd,
        roleFit: { estimatedFitPercent: 70, strongMatch: ["Kafka"], partialMatch: ["AWS"], concerns: [], likelyCompanyQuestions: [] },
      }),
    );
    const anthropic = fakeAnthropic(create);

    const ctx: GenerateReportContext = { analysis: analysisWithJd, state, transcript };
    const result = await generateReport(anthropic, ctx, "test-model");

    const body = create.mock.calls[0]?.[0] as { system: string; messages: { content: string }[] };
    expect(body.system).toContain("roleFit");
    expect(body.messages[0]?.content ?? "").toContain("<job_match>");
    expect(result.data.roleFit).toEqual({
      estimatedFitPercent: 70,
      strongMatch: ["Kafka"],
      partialMatch: ["AWS"],
      concerns: [],
      likelyCompanyQuestions: [],
    });
  });

  it("strips roleFit from the result if the model adds one despite no job description being supplied", async () => {
    const create = vi.fn().mockResolvedValue(
      toolUseMessage({
        ...validReportNoJd,
        roleFit: { estimatedFitPercent: 70, strongMatch: [], partialMatch: [], concerns: [], likelyCompanyQuestions: [] },
      }),
    );
    const anthropic = fakeAnthropic(create);

    const ctx: GenerateReportContext = { analysis: analysisNoJd, state, transcript };
    const result = await generateReport(anthropic, ctx, "test-model");

    expect(result.data.roleFit).toBeUndefined();
  });

  it("filters out claimRisk entries and categoryScores for claims/categories that were never tested", async () => {
    const create = vi.fn().mockResolvedValue(
      toolUseMessage({
        ...validReportNoJd,
        categoryScores: { ...validReportNoJd.categoryScores, LEADERSHIP: 9 },
        claimRisk: [
          ...validReportNoJd.claimRisk,
          { claimId: "claim-untested", label: "Team leadership", status: "SAFE", explanation: "Hallucinated — never asked about." },
        ],
      }),
    );
    const anthropic = fakeAnthropic(create);

    const ctx: GenerateReportContext = { analysis: analysisNoJd, state, transcript };
    const result = await generateReport(anthropic, ctx, "test-model");

    expect(result.data.categoryScores).toEqual({ MESSAGING: 8, CLOUD: 2 });
    expect(result.data.claimRisk.map((c) => c.claimId)).toEqual(["claim-kafka", "claim-aws"]);
  });

  it("validates a report with no red flags (an empty array is a correct, not a defective, result)", async () => {
    const create = vi.fn().mockResolvedValue(toolUseMessage({ ...validReportNoJd, redFlags: [] }));
    const anthropic = fakeAnthropic(create);

    const ctx: GenerateReportContext = { analysis: analysisNoJd, state, transcript };
    const result = await generateReport(anthropic, ctx, "test-model");

    expect(result.data.redFlags).toEqual([]);
    expect(result.data.strongAreas.length).toBeGreaterThan(0);
  });

  it("validates a report with no strong areas (an empty array is a correct, not a defective, result)", async () => {
    const create = vi.fn().mockResolvedValue(toolUseMessage({ ...validReportNoJd, strongAreas: [] }));
    const anthropic = fakeAnthropic(create);

    const ctx: GenerateReportContext = { analysis: analysisNoJd, state, transcript };
    const result = await generateReport(anthropic, ctx, "test-model");

    expect(result.data.strongAreas).toEqual([]);
    expect(result.data.redFlags.length).toBeGreaterThan(0);
  });

  it("propagates schema validation failure for a malformed mocked response", async () => {
    const invalid = { ...validReportNoJd, overallReadiness: 150 };
    const create = vi.fn().mockResolvedValue(toolUseMessage(invalid));
    const anthropic = fakeAnthropic(create);

    const ctx: GenerateReportContext = { analysis: analysisNoJd, state, transcript };
    await expect(generateReport(anthropic, ctx, "test-model")).rejects.toThrow(/validation failed/i);
    expect(create).toHaveBeenCalledTimes(2);
  });
});
