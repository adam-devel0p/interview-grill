import { describe, expect, it } from "vitest";
import { selectNextClaim, shouldCompleteInterview } from "../../../src/worker/lib/interview/controller";
import { initInterviewState } from "../../../src/worker/lib/interview/state";
import type { CvAnalysis, TechnicalClaim } from "../../../src/shared/schemas/analysis";
import type { InterviewState } from "../../../src/shared/schemas/interviewState";

function claim(overrides: Partial<TechnicalClaim> & Pick<TechnicalClaim, "id">): TechnicalClaim {
  return {
    text: "Led migration of the order service to Kafka-based event sourcing.",
    sourceExcerpt: "Led migration of the order service to Kafka-based event sourcing.",
    category: "MESSAGING",
    riskLevel: "medium",
    confidence: 0.7,
    reasoning: "Specific but worth probing for personal vs. team contribution.",
    likelyQuestions: ["What was your specific role in the migration?"],
    requiredDepth: "senior",
    ...overrides,
  };
}

function analysis(claims: TechnicalClaim[], jobMatch?: CvAnalysis["jobMatch"]): CvAnalysis {
  return {
    estimatedSeniority: "senior",
    yearsExperienceEstimate: 9,
    primaryStack: ["Java", "Spring Boot", "Kafka"],
    technologies: ["Java", "Spring Boot", "Kafka"],
    projects: [{ name: "Order service migration", description: "Monolith to microservices." }],
    claims,
    vagueClaims: [],
    jobMatch,
  };
}

describe("shouldCompleteInterview", () => {
  it("is false on a freshly-initialized state", () => {
    const cv = analysis([claim({ id: "claim-1", riskLevel: "high" })]);
    const state = initInterviewState(cv);

    expect(shouldCompleteInterview(state, cv)).toBe(false);
  });

  it("is true once majorQuestionsAsked reaches the configured max (20)", () => {
    const cv = analysis([claim({ id: "claim-1", riskLevel: "high" })]);
    const state: InterviewState = { ...initInterviewState(cv), majorQuestionsAsked: 20 };

    expect(shouldCompleteInterview(state, cv)).toBe(true);
  });

  it("is true once estimatedCompletion crosses the 0.9 threshold", () => {
    const cv = analysis([claim({ id: "claim-1", riskLevel: "high" })]);
    const state: InterviewState = { ...initInterviewState(cv), estimatedCompletion: 0.95 };

    expect(shouldCompleteInterview(state, cv)).toBe(true);
  });

  it("is true when all high-risk claims are tested and the minimum question count is met", () => {
    const cv = analysis([claim({ id: "claim-1", riskLevel: "high" }), claim({ id: "claim-2", riskLevel: "low" })]);
    const state: InterviewState = {
      ...initInterviewState(cv),
      testedClaimIds: ["claim-1"],
      majorQuestionsAsked: 12,
    };

    expect(shouldCompleteInterview(state, cv)).toBe(true);
  });

  it("is false when all high-risk claims are tested but the minimum question count isn't met yet", () => {
    const cv = analysis([claim({ id: "claim-1", riskLevel: "high" }), claim({ id: "claim-2", riskLevel: "low" })]);
    const state: InterviewState = {
      ...initInterviewState(cv),
      testedClaimIds: ["claim-1"],
      majorQuestionsAsked: 3,
    };

    expect(shouldCompleteInterview(state, cv)).toBe(false);
  });
});

describe("selectNextClaim", () => {
  it("prioritizes untested high-risk claims over medium/low-risk ones", () => {
    const cv = analysis([
      claim({ id: "claim-low", riskLevel: "low" }),
      claim({ id: "claim-high", riskLevel: "high" }),
      claim({ id: "claim-medium", riskLevel: "medium" }),
    ]);
    const state = initInterviewState(cv);

    expect(selectNextClaim(state, cv)?.id).toBe("claim-high");
  });

  it("prioritizes a high-risk claim that also covers a jobMatch interview priority", () => {
    const cv = analysis(
      [
        claim({ id: "claim-a", riskLevel: "high", text: "Owned Postgres schema migrations." }),
        claim({ id: "claim-b", riskLevel: "high", text: "Ran the Kafka cluster upgrade end to end." }),
      ],
      {
        roleMatchScore: 80,
        requiredTechnologies: ["Kafka"],
        strongMatches: ["Kafka"],
        partialMatches: [],
        gaps: [],
        skillsMaybeNotDeepEnough: [],
        interviewPriorities: ["Kafka operational experience"],
      },
    );
    const state = initInterviewState(cv);

    expect(selectNextClaim(state, cv)?.id).toBe("claim-b");
  });

  it("falls back to remaining claims once all high-risk and priority-matching claims are tested", () => {
    const cv = analysis([
      claim({ id: "claim-high", riskLevel: "high" }),
      claim({ id: "claim-low", riskLevel: "low" }),
    ]);
    const state: InterviewState = { ...initInterviewState(cv), testedClaimIds: ["claim-high"] };

    expect(selectNextClaim(state, cv)?.id).toBe("claim-low");
  });

  it("returns undefined once every claim has been tested", () => {
    const cv = analysis([claim({ id: "claim-1" }), claim({ id: "claim-2" })]);
    const state: InterviewState = { ...initInterviewState(cv), testedClaimIds: ["claim-1", "claim-2"] };

    expect(selectNextClaim(state, cv)).toBeUndefined();
  });
});
