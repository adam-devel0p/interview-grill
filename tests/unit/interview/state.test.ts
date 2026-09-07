import { describe, expect, it } from "vitest";
import { applyEvaluation, initInterviewState } from "../../../src/worker/lib/interview/state";
import type { CvAnalysis, TechnicalClaim } from "../../../src/shared/schemas/analysis";
import type { AnswerEvaluation, ControllerDecision } from "../../../src/shared/schemas/evaluation";

function claim(overrides: Partial<TechnicalClaim> & Pick<TechnicalClaim, "id">): TechnicalClaim {
  return {
    text: "Led migration of the order service to Kafka-based event sourcing.",
    sourceExcerpt: "Led migration of the order service to Kafka-based event sourcing.",
    category: "MESSAGING",
    riskLevel: "high",
    confidence: 0.7,
    reasoning: "Specific but worth probing for personal vs. team contribution.",
    likelyQuestions: ["What was your specific role in the migration?"],
    requiredDepth: "senior",
    ...overrides,
  };
}

function analysis(claims: TechnicalClaim[]): CvAnalysis {
  return {
    estimatedSeniority: "senior",
    yearsExperienceEstimate: 9,
    primaryStack: ["Java", "Spring Boot", "Kafka"],
    technologies: ["Java", "Spring Boot", "Kafka"],
    projects: [{ name: "Order service migration", description: "Monolith to microservices." }],
    claims,
    vagueClaims: [],
  };
}

function evaluation(overrides: Partial<AnswerEvaluation> = {}): AnswerEvaluation {
  return {
    technicalAccuracy: 5,
    depth: 5,
    clarity: 5,
    realWorldEvidence: 5,
    specificity: 5,
    seniority: 5,
    buzzwordRisk: 3,
    strengths: [],
    weaknesses: [],
    missingConcepts: [],
    interviewerConfidence: "probably_familiar",
    ...overrides,
  };
}

function decision(overrides: Partial<ControllerDecision> = {}): ControllerDecision {
  return {
    action: "FOLLOW_UP",
    reason: "Probing further.",
    shouldComplete: false,
    ...overrides,
  };
}

describe("initInterviewState", () => {
  it("initializes empty tracking fields, zeroed counters, and seniority copied from the analysis", () => {
    const cv = analysis([claim({ id: "claim-1", riskLevel: "high" }), claim({ id: "claim-2", riskLevel: "low" })]);

    const state = initInterviewState(cv);

    expect(state.candidateSeniority).toBe("senior");
    expect(state.testedClaimIds).toEqual([]);
    expect(state.activeClaimId).toBeUndefined();
    expect(state.topicScores).toEqual({});
    expect(state.strongAreas).toEqual([]);
    expect(state.weakAreas).toEqual([]);
    expect(state.redFlags).toEqual([]);
    expect(state.contradictions).toEqual([]);
    expect(state.conceptsToProbe).toEqual([]);
    expect(state.candidatePatterns).toEqual({
      vagueAnswers: 0,
      strongConcreteAnswers: 0,
      excessiveWeLanguage: 0,
      buzzwordAnswers: 0,
    });
    expect(state.majorQuestionsAsked).toBe(0);
    expect(state.estimatedCompletion).toBe(0);
  });

  it("captures only the high-risk claim ids from the analysis", () => {
    const cv = analysis([
      claim({ id: "claim-1", riskLevel: "high" }),
      claim({ id: "claim-2", riskLevel: "medium" }),
      claim({ id: "claim-3", riskLevel: "high" }),
      claim({ id: "claim-4", riskLevel: "low" }),
    ]);

    const state = initInterviewState(cv);

    expect(state.highRiskClaimIds).toEqual(["claim-1", "claim-3"]);
  });
});

describe("applyEvaluation", () => {
  it("moves a strong, concrete, accurate answer toward strongAreas and raises the topicScores entry", () => {
    const state = initInterviewState(analysis([claim({ id: "claim-1" })]));

    const next = applyEvaluation(state, {
      claimId: "claim-1",
      category: "MESSAGING",
      evaluation: evaluation({
        technicalAccuracy: 9,
        depth: 8,
        specificity: 9,
        realWorldEvidence: 9,
        strengths: ["Clearly explained partition rebalancing trade-offs from firsthand experience."],
      }),
      decision: decision({ action: "GO_DEEPER" }),
    });

    expect(next.strongAreas).toContain(
      "Clearly explained partition rebalancing trade-offs from firsthand experience.",
    );
    expect(next.candidatePatterns.strongConcreteAnswers).toBe(1);
    expect(next.topicScores.MESSAGING).toBeCloseTo(9 * 0.4 + 8 * 0.3 + 9 * 0.3, 5);
  });

  it("raises buzzwordAnswers/vagueAnswers and adds to weakAreas/conceptsToProbe for a vague, buzzword-heavy answer", () => {
    const state = initInterviewState(analysis([claim({ id: "claim-1" })]));

    const next = applyEvaluation(state, {
      claimId: "claim-1",
      category: "MESSAGING",
      evaluation: evaluation({
        specificity: 2,
        buzzwordRisk: 8,
        interviewerConfidence: "surface_level",
        weaknesses: ["Answer stayed at a buzzword level without concrete detail."],
        missingConcepts: ["exactly-once delivery semantics"],
      }),
      decision: decision({ action: "CHALLENGE" }),
    });

    expect(next.candidatePatterns.buzzwordAnswers).toBe(1);
    expect(next.candidatePatterns.vagueAnswers).toBe(1);
    expect(next.weakAreas).toContain("Answer stayed at a buzzword level without concrete detail.");
    expect(next.conceptsToProbe).toContain("exactly-once delivery semantics");
  });

  it("appends a redFlag to redFlags", () => {
    const state = initInterviewState(analysis([claim({ id: "claim-1" })]));

    const next = applyEvaluation(state, {
      claimId: "claim-1",
      evaluation: evaluation({ redFlag: "Could not explain basic Kafka consumer group behavior." }),
      decision: decision({ action: "CHALLENGE" }),
    });

    expect(next.redFlags).toEqual(["Could not explain basic Kafka consumer group behavior."]);
  });

  it("marks a redFlag naming an inconsistency as a contradiction too", () => {
    const state = initInterviewState(analysis([claim({ id: "claim-1" })]));

    const next = applyEvaluation(state, {
      claimId: "claim-1",
      evaluation: evaluation({
        redFlag: "This contradicts the earlier claim of leading the migration solo.",
      }),
      decision: decision({ action: "CHALLENGE" }),
    });

    expect(next.contradictions).toEqual(["This contradicts the earlier claim of leading the migration solo."]);
  });

  it("increments excessiveWeLanguage when weaknesses call out unclear personal ownership", () => {
    const state = initInterviewState(analysis([claim({ id: "claim-1" })]));

    const next = applyEvaluation(state, {
      claimId: "claim-1",
      evaluation: evaluation({
        weaknesses: ["Relied on \"we\" language throughout with unclear individual contribution."],
      }),
      decision: decision({ action: "CHALLENGE" }),
    });

    expect(next.candidatePatterns.excessiveWeLanguage).toBe(1);
  });

  it("does not add the claim to testedClaimIds while the decision keeps following up on it", () => {
    let state = initInterviewState(analysis([claim({ id: "claim-1" })]));

    state = applyEvaluation(state, {
      claimId: "claim-1",
      evaluation: evaluation(),
      decision: decision({ action: "FOLLOW_UP" }),
    });
    state = applyEvaluation(state, {
      claimId: "claim-1",
      evaluation: evaluation(),
      decision: decision({ action: "CLARIFY" }),
    });
    state = applyEvaluation(state, {
      claimId: "claim-1",
      evaluation: evaluation(),
      decision: decision({ action: "FOLLOW_UP" }),
    });

    expect(state.testedClaimIds).toEqual([]);
    expect(state.majorQuestionsAsked).toBe(3);
  });

  it("adds the claim to testedClaimIds exactly once once the interviewer moves past it", () => {
    let state = initInterviewState(analysis([claim({ id: "claim-1" })]));

    state = applyEvaluation(state, {
      claimId: "claim-1",
      evaluation: evaluation(),
      decision: decision({ action: "FOLLOW_UP" }),
    });
    state = applyEvaluation(state, {
      claimId: "claim-1",
      evaluation: evaluation(),
      decision: decision({ action: "NEW_TOPIC", nextTarget: "claim-2" }),
    });
    // A later turn still referencing claim-1 (e.g. a stray follow-up) must not duplicate it.
    state = applyEvaluation(state, {
      claimId: "claim-1",
      evaluation: evaluation(),
      decision: decision({ action: "GO_DEEPER" }),
    });

    expect(state.testedClaimIds).toEqual(["claim-1"]);
  });

  it("sets activeClaimId to decision.nextTarget on NEW_TOPIC and clears it on INTERVIEW_COMPLETE", () => {
    let state = initInterviewState(analysis([claim({ id: "claim-1" }), claim({ id: "claim-2" })]));

    state = applyEvaluation(state, {
      claimId: "claim-1",
      evaluation: evaluation(),
      decision: decision({ action: "NEW_TOPIC", nextTarget: "claim-2" }),
    });
    expect(state.activeClaimId).toBe("claim-2");

    state = applyEvaluation(state, {
      claimId: "claim-2",
      evaluation: evaluation(),
      decision: decision({ action: "INTERVIEW_COMPLETE", shouldComplete: true }),
    });
    expect(state.activeClaimId).toBeUndefined();
  });

  it("forces estimatedCompletion to 1 the moment decision.shouldComplete is true", () => {
    const state = initInterviewState(analysis([claim({ id: "claim-1" })]));

    const next = applyEvaluation(state, {
      claimId: "claim-1",
      evaluation: evaluation(),
      decision: decision({ action: "INTERVIEW_COMPLETE", shouldComplete: true }),
    });

    expect(next.estimatedCompletion).toBe(1);
  });

  it("raises estimatedCompletion as high-risk claims get tested and questions accumulate", () => {
    let state = initInterviewState(
      analysis([claim({ id: "claim-1", riskLevel: "high" }), claim({ id: "claim-2", riskLevel: "high" })]),
    );
    expect(state.estimatedCompletion).toBe(0);

    state = applyEvaluation(state, {
      claimId: "claim-1",
      evaluation: evaluation(),
      decision: decision({ action: "NEW_TOPIC", nextTarget: "claim-2" }),
    });
    const afterOne = state.estimatedCompletion;
    expect(afterOne).toBeGreaterThan(0);

    state = applyEvaluation(state, {
      claimId: "claim-2",
      evaluation: evaluation(),
      decision: decision({ action: "GO_DEEPER" }),
    });
    expect(state.estimatedCompletion).toBeGreaterThan(afterOne);
    expect(state.estimatedCompletion).toBeLessThanOrEqual(1);
  });
});
