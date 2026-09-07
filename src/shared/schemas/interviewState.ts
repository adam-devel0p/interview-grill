import { z } from "zod";

export const InterviewStateSchema = z.object({
  candidateSeniority: z.string(),
  testedClaimIds: z.array(z.string()),
  activeClaimId: z.string().optional(),
  topicScores: z.record(z.string(), z.number()),
  strongAreas: z.array(z.string()),
  weakAreas: z.array(z.string()),
  redFlags: z.array(z.string()),
  contradictions: z.array(z.string()),
  conceptsToProbe: z.array(z.string()),
  candidatePatterns: z.object({
    vagueAnswers: z.number(),
    strongConcreteAnswers: z.number(),
    excessiveWeLanguage: z.number(),
    buzzwordAnswers: z.number(),
  }),
  majorQuestionsAsked: z.number(),
  estimatedCompletion: z.number().min(0).max(1),
});
export type InterviewState = z.infer<typeof InterviewStateSchema>;
