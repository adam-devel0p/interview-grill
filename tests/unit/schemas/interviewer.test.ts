import { describe, expect, it } from "vitest";
import { InterviewerResponseSchema } from "../../../src/shared/schemas/interviewer";

const validResponse = {
  question: "You said the team migrated to microservices — what was your specific role in that?",
  targetClaimId: "claim-1",
  intent: "Probe for personal contribution behind a team claim",
  difficulty: "senior",
  expectedConcepts: ["service boundaries", "data ownership"],
};

describe("InterviewerResponseSchema", () => {
  it("accepts a fully-populated valid response", () => {
    expect(InterviewerResponseSchema.safeParse(validResponse).success).toBe(true);
  });

  it("accepts a response without the optional targetClaimId", () => {
    const { targetClaimId: _targetClaimId, ...withoutTarget } = validResponse;
    expect(InterviewerResponseSchema.safeParse(withoutTarget).success).toBe(true);
  });

  it("rejects an empty question string", () => {
    const result = InterviewerResponseSchema.safeParse({ ...validResponse, question: "" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid difficulty enum value", () => {
    const result = InterviewerResponseSchema.safeParse({ ...validResponse, difficulty: "expert" });
    expect(result.success).toBe(false);
  });

  it("rejects a response missing a required field", () => {
    const { intent: _intent, ...missingIntent } = validResponse;
    expect(InterviewerResponseSchema.safeParse(missingIntent).success).toBe(false);
  });
});
