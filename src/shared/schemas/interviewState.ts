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
  // Phase 4 addition (not in the original build-plan spec): the ids of every
  // high-risk claim from the CvAnalysis this interview was initialized from,
  // captured once at `initInterviewState` time. `applyEvaluation` (Phase 4) needs
  // "tested high-risk claims / total high-risk claims" to recompute
  // `estimatedCompletion`, but only receives per-turn evaluation/decision data, not
  // the full CvAnalysis — storing this list on the state avoids threading `analysis`
  // through every `applyEvaluation` call.
  highRiskClaimIds: z.array(z.string()),
});
export type InterviewState = z.infer<typeof InterviewStateSchema>;
