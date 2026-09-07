import { z } from "zod";

export const ClaimRiskStatusSchema = z.enum(["SAFE", "NEEDS_PRACTICE", "HIGH_RISK"]);
export type ClaimRiskStatus = z.infer<typeof ClaimRiskStatusSchema>;

export const ReportSchema = z.object({
  overallReadiness: z.number().min(0).max(100),
  categoryScores: z.record(z.string(), z.number()),
  verdict: z.object({
    status: z.enum(["STRONG", "INTERVIEW_READY", "MOSTLY_READY", "NEEDS_PREPARATION", "HIGH_RISK"]),
    summary: z.string(),
  }),
  claimRisk: z.array(
    z.object({
      claimId: z.string(),
      label: z.string(),
      status: ClaimRiskStatusSchema,
      explanation: z.string(),
      likelyQuestions: z.array(z.string()).optional(),
      suggestedCvFraming: z
        .object({
          current: z.string(),
          suggested: z.string(),
        })
        .optional(),
    }),
  ),
  redFlags: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      interviewerConclusion: z.string(),
      conceptsToRevise: z.array(z.string()),
    }),
  ),
  strongAreas: z.array(
    z.object({
      title: z.string(),
      evidence: z.array(z.string()),
      interviewerImpression: z.string(),
    }),
  ),
  betterAnswers: z.array(
    z.object({
      question: z.string(),
      candidateAnswer: z.string(),
      whyWeak: z.string(),
      strongerAnswerStructure: z.array(z.string()),
      isExample: z.boolean(),
    }),
  ),
  likelyFollowUpQuestions: z.array(z.string()).min(1).max(10),
  studyPriorities: z.array(
    z.object({
      priority: z.number(),
      topic: z.string(),
      estimatedMinutes: z.string(),
      reviewItems: z.array(z.string()),
      note: z.string().optional(),
    }),
  ),
  roleFit: z
    .object({
      estimatedFitPercent: z.number(),
      strongMatch: z.array(z.string()),
      partialMatch: z.array(z.string()),
      concerns: z.array(z.string()),
      likelyCompanyQuestions: z.array(z.string()),
    })
    .optional(),
});
export type Report = z.infer<typeof ReportSchema>;
