import { z } from "zod";

export const ClaimCategorySchema = z.enum([
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
]);
export type ClaimCategory = z.infer<typeof ClaimCategorySchema>;

export const TechnicalClaimSchema = z.object({
  id: z.string(),
  text: z.string(),
  sourceExcerpt: z.string(),
  project: z.string().optional(),
  category: ClaimCategorySchema,
  riskLevel: z.enum(["low", "medium", "high"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  likelyQuestions: z.array(z.string()),
  requiredDepth: z.enum(["basic", "intermediate", "senior"]),
});
export type TechnicalClaim = z.infer<typeof TechnicalClaimSchema>;

export const JobMatchSchema = z.object({
  roleMatchScore: z.number().min(0).max(100),
  requiredTechnologies: z.array(z.string()),
  strongMatches: z.array(z.string()),
  partialMatches: z.array(z.string()),
  gaps: z.array(z.string()),
  skillsMaybeNotDeepEnough: z.array(z.string()),
  interviewPriorities: z.array(z.string()),
});
export type JobMatch = z.infer<typeof JobMatchSchema>;

export const CvAnalysisSchema = z.object({
  estimatedSeniority: z.enum(["junior", "mid", "senior", "staff_plus"]),
  yearsExperienceEstimate: z.number().optional(),
  primaryStack: z.array(z.string()),
  technologies: z.array(z.string()),
  projects: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
    }),
  ),
  claims: z.array(TechnicalClaimSchema).min(1),
  vagueClaims: z.array(z.string()),
  jobMatch: JobMatchSchema.optional(),
});
export type CvAnalysis = z.infer<typeof CvAnalysisSchema>;
