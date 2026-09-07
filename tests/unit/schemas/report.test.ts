import { describe, expect, it } from "vitest";
import { ReportSchema } from "../../../src/shared/schemas/report";

const baseReport = {
  overallReadiness: 62,
  categoryScores: { MICROSERVICES: 6, JAVA: 8 },
  verdict: {
    status: "MOSTLY_READY",
    summary: "Solid Java fundamentals, shaky on distributed-systems failure modes.",
  },
  claimRisk: [
    {
      claimId: "claim-1",
      label: "Led microservices migration",
      status: "NEEDS_PRACTICE",
      explanation: "Could not articulate rollback strategy under follow-up.",
      likelyQuestions: ["How did you handle partial rollout failures?"],
      suggestedCvFraming: {
        current: "Led migration to microservices",
        suggested: "Contributed to migration to microservices, owned the payments service",
      },
    },
  ],
  redFlags: [
    {
      title: "Vague on failure handling",
      description: "Answer relied on generic best-practice language rather than specifics",
      interviewerConclusion: "Likely didn't own production incident response",
      conceptsToRevise: ["circuit breakers", "idempotency"],
    },
  ],
  strongAreas: [
    {
      title: "Java concurrency",
      evidence: ["Explained happens-before relationship correctly"],
      interviewerImpression: "Genuinely strong",
    },
  ],
  betterAnswers: [
    {
      question: "How would you handle a partial rollout failure?",
      candidateAnswer: "We'd just roll back.",
      whyWeak: "No detail on detection or automation",
      strongerAnswerStructure: ["Detection signal", "Automated rollback trigger", "Postmortem"],
      isExample: true,
    },
  ],
  likelyFollowUpQuestions: ["What metrics would trigger an automatic rollback?"],
  studyPriorities: [
    {
      priority: 1,
      topic: "Distributed systems failure modes",
      estimatedMinutes: "45",
      reviewItems: ["Circuit breakers", "Idempotency keys"],
      note: "Focus here first",
    },
  ],
};

describe("ReportSchema", () => {
  it("accepts a valid report without roleFit", () => {
    expect(ReportSchema.safeParse(baseReport).success).toBe(true);
  });

  it("accepts a valid report with roleFit populated", () => {
    const withRoleFit = {
      ...baseReport,
      roleFit: {
        estimatedFitPercent: 72,
        strongMatch: ["Java", "Spring"],
        partialMatch: ["Kubernetes"],
        concerns: ["Limited Kafka depth"],
        likelyCompanyQuestions: ["How do you approach schema evolution in Kafka?"],
      },
    };
    expect(ReportSchema.safeParse(withRoleFit).success).toBe(true);
  });

  it("rejects likelyFollowUpQuestions with zero entries", () => {
    const result = ReportSchema.safeParse({ ...baseReport, likelyFollowUpQuestions: [] });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid verdict status enum value", () => {
    const result = ReportSchema.safeParse({
      ...baseReport,
      verdict: { ...baseReport.verdict, status: "AMAZING" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid claimRisk status enum value", () => {
    const result = ReportSchema.safeParse({
      ...baseReport,
      claimRisk: [{ ...baseReport.claimRisk[0], status: "UNKNOWN" }],
    });
    expect(result.success).toBe(false);
  });
});
