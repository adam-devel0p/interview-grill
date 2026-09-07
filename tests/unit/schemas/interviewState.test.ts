import { describe, expect, it } from "vitest";
import { InterviewStateSchema } from "../../../src/shared/schemas/interviewState";

const validState = {
  candidateSeniority: "senior",
  testedClaimIds: ["claim-1"],
  activeClaimId: "claim-2",
  topicScores: { MICROSERVICES: 7.5, JAVA: 8 },
  strongAreas: ["Java fundamentals"],
  weakAreas: ["Kafka failure handling"],
  redFlags: [],
  contradictions: [],
  conceptsToProbe: ["idempotency"],
  candidatePatterns: {
    vagueAnswers: 1,
    strongConcreteAnswers: 3,
    excessiveWeLanguage: 0,
    buzzwordAnswers: 1,
  },
  majorQuestionsAsked: 5,
  estimatedCompletion: 0.4,
};

describe("InterviewStateSchema", () => {
  it("accepts a fully-populated valid state", () => {
    expect(InterviewStateSchema.safeParse(validState).success).toBe(true);
  });

  it("accepts a state without the optional activeClaimId", () => {
    const { activeClaimId: _activeClaimId, ...withoutActive } = validState;
    expect(InterviewStateSchema.safeParse(withoutActive).success).toBe(true);
  });

  it("rejects an estimatedCompletion out of the 0..1 range", () => {
    const result = InterviewStateSchema.safeParse({ ...validState, estimatedCompletion: 1.2 });
    expect(result.success).toBe(false);
  });

  it("rejects a state missing the candidatePatterns object", () => {
    const { candidatePatterns: _candidatePatterns, ...missingPatterns } = validState;
    expect(InterviewStateSchema.safeParse(missingPatterns).success).toBe(false);
  });

  it("rejects a topicScores value that isn't a number", () => {
    const result = InterviewStateSchema.safeParse({
      ...validState,
      topicScores: { JAVA: "high" },
    });
    expect(result.success).toBe(false);
  });
});
