import { z } from "zod";

export const InterviewerResponseSchema = z.object({
  question: z.string().min(1),
  targetClaimId: z.string().optional(),
  intent: z.string(),
  difficulty: z.enum(["basic", "intermediate", "senior"]),
  expectedConcepts: z.array(z.string()),
});
export type InterviewerResponse = z.infer<typeof InterviewerResponseSchema>;
