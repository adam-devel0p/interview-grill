import { describe, expect, it } from "vitest";
import {
  AnswerEvaluationSchema,
  ControllerDecisionSchema,
  EvaluationAndDecisionSchema,
} from "../../../src/shared/schemas/evaluation";

const validEvaluation = {
  technicalAccuracy: 7,
  depth: 6,
  clarity: 8,
  realWorldEvidence: 5,
  specificity: 6,
  seniority: 7,
  buzzwordRisk: 3,
  strengths: ["Clear explanation of the trade-offs made"],
  weaknesses: ["Didn't mention failure handling"],
  missingConcepts: ["idempotency"],
  redFlag: "Couldn't explain what happens on partial failure",
  interviewerConfidence: "probably_familiar",
};

const validDecision = {
  action: "FOLLOW_UP",
  reason: "Answer was plausible but shallow on failure handling",
  nextTarget: "claim-1",
  shouldComplete: false,
};

describe("AnswerEvaluationSchema", () => {
  it("accepts a fully-populated valid evaluation", () => {
    expect(AnswerEvaluationSchema.safeParse(validEvaluation).success).toBe(true);
  });

  it("accepts an evaluation without the optional redFlag", () => {
    const { redFlag: _redFlag, ...withoutRedFlag } = validEvaluation;
    expect(AnswerEvaluationSchema.safeParse(withoutRedFlag).success).toBe(true);
  });

  it("rejects a score out of the 1..10 range", () => {
    const result = AnswerEvaluationSchema.safeParse({ ...validEvaluation, technicalAccuracy: 11 });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid interviewerConfidence enum value", () => {
    const result = AnswerEvaluationSchema.safeParse({ ...validEvaluation, interviewerConfidence: "certain" });
    expect(result.success).toBe(false);
  });
});

describe("ControllerDecisionSchema", () => {
  it("accepts a fully-populated valid decision", () => {
    expect(ControllerDecisionSchema.safeParse(validDecision).success).toBe(true);
  });

  it("accepts a decision without the optional nextTarget", () => {
    const { nextTarget: _nextTarget, ...withoutTarget } = validDecision;
    expect(ControllerDecisionSchema.safeParse(withoutTarget).success).toBe(true);
  });

  it("rejects an invalid action enum value", () => {
    const result = ControllerDecisionSchema.safeParse({ ...validDecision, action: "SKIP" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing shouldComplete field", () => {
    const { shouldComplete: _shouldComplete, ...missingShouldComplete } = validDecision;
    expect(ControllerDecisionSchema.safeParse(missingShouldComplete).success).toBe(false);
  });
});

describe("EvaluationAndDecisionSchema", () => {
  it("accepts a valid combined evaluation + decision", () => {
    const result = EvaluationAndDecisionSchema.safeParse({
      evaluation: validEvaluation,
      decision: validDecision,
    });
    expect(result.success).toBe(true);
  });

  it("rejects when the nested evaluation is invalid", () => {
    const result = EvaluationAndDecisionSchema.safeParse({
      evaluation: { ...validEvaluation, depth: 0 },
      decision: validDecision,
    });
    expect(result.success).toBe(false);
  });
});
