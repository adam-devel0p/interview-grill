import { describe, expect, it } from "vitest";
import { ClaimCategorySchema, CvAnalysisSchema, TechnicalClaimSchema } from "../../../src/shared/schemas/analysis";

const validClaim = {
  id: "claim-1",
  text: "Led migration of a monolith to microservices",
  sourceExcerpt: "Led migration of a monolith to microservices using Spring Boot and Kafka",
  project: "Order Platform",
  category: "MICROSERVICES",
  riskLevel: "high",
  confidence: 0.8,
  reasoning: "Broad architectural claim, worth probing for personal contribution",
  likelyQuestions: ["What was your specific role in the migration?"],
  requiredDepth: "senior",
};

describe("ClaimCategorySchema", () => {
  it("accepts every documented category", () => {
    const categories = [
      "JAVA",
      "SPRING",
      "MICROSERVICES",
      "DATABASE",
      "MESSAGING",
      "SYSTEM_DESIGN",
      "CLOUD",
      "DEVOPS",
      "OBSERVABILITY",
      "TESTING",
      "SECURITY",
      "PERFORMANCE",
      "ARCHITECTURE",
      "LEADERSHIP",
      "OTHER",
    ];
    for (const category of categories) {
      expect(ClaimCategorySchema.safeParse(category).success).toBe(true);
    }
  });

  it("rejects an unknown category", () => {
    const result = ClaimCategorySchema.safeParse("BLOCKCHAIN");
    expect(result.success).toBe(false);
  });
});

describe("TechnicalClaimSchema", () => {
  it("accepts a fully-populated valid claim", () => {
    const result = TechnicalClaimSchema.safeParse(validClaim);
    expect(result.success).toBe(true);
  });

  it("accepts a claim without the optional project field", () => {
    const { project: _project, ...withoutProject } = validClaim;
    const result = TechnicalClaimSchema.safeParse(withoutProject);
    expect(result.success).toBe(true);
  });

  it("rejects a claim missing a required field", () => {
    const { reasoning: _reasoning, ...missingReasoning } = validClaim;
    const result = TechnicalClaimSchema.safeParse(missingReasoning);
    expect(result.success).toBe(false);
  });

  it("rejects an invalid riskLevel enum value", () => {
    const result = TechnicalClaimSchema.safeParse({ ...validClaim, riskLevel: "extreme" });
    expect(result.success).toBe(false);
  });

  it("rejects a confidence value out of the 0..1 range", () => {
    const result = TechnicalClaimSchema.safeParse({ ...validClaim, confidence: 1.5 });
    expect(result.success).toBe(false);
  });
});

describe("CvAnalysisSchema", () => {
  const baseAnalysis = {
    estimatedSeniority: "senior",
    yearsExperienceEstimate: 9,
    primaryStack: ["Java", "Spring Boot", "Kafka"],
    technologies: ["Java", "Spring Boot", "Kafka", "PostgreSQL", "AWS"],
    projects: [{ name: "Order Platform", description: "Migrated monolith to microservices" }],
    claims: [validClaim],
    vagueClaims: ["improved performance"],
  };

  it("accepts a valid analysis without jobMatch", () => {
    const result = CvAnalysisSchema.safeParse(baseAnalysis);
    expect(result.success).toBe(true);
  });

  it("accepts a valid analysis with jobMatch populated", () => {
    const withJobMatch = {
      ...baseAnalysis,
      jobMatch: {
        roleMatchScore: 78,
        requiredTechnologies: ["Java", "Kubernetes"],
        strongMatches: ["Java"],
        partialMatches: ["Kubernetes"],
        gaps: ["GraphQL"],
        skillsMaybeNotDeepEnough: ["Kubernetes"],
        interviewPriorities: ["Kubernetes depth"],
      },
    };
    const result = CvAnalysisSchema.safeParse(withJobMatch);
    expect(result.success).toBe(true);
  });

  it("rejects an analysis with zero claims", () => {
    const result = CvAnalysisSchema.safeParse({ ...baseAnalysis, claims: [] });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid estimatedSeniority enum value", () => {
    const result = CvAnalysisSchema.safeParse({ ...baseAnalysis, estimatedSeniority: "principal" });
    expect(result.success).toBe(false);
  });
});
