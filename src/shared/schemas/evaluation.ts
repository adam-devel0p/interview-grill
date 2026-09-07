import { z } from "zod";

export const NextActionSchema = z.enum([
  "FOLLOW_UP",
  "GO_DEEPER",
  "CHALLENGE",
  "NEW_TOPIC",
  "CLARIFY",
  "INTERVIEW_COMPLETE",
]);
export type NextAction = z.infer<typeof NextActionSchema>;

export const AnswerEvaluationSchema = z.object({
  technicalAccuracy: z.number().min(1).max(10),
  depth: z.number().min(1).max(10),
  clarity: z.number().min(1).max(10),
  realWorldEvidence: z.number().min(1).max(10),
  specificity: z.number().min(1).max(10),
  seniority: z.number().min(1).max(10),
  buzzwordRisk: z.number().min(1).max(10),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  missingConcepts: z.array(z.string()),
  redFlag: z.string().optional(),
  interviewerConfidence: z.enum([
    "likely_genuine_experience",
    "probably_familiar",
    "surface_level",
    "uncertain",
  ]),
});
export type AnswerEvaluation = z.infer<typeof AnswerEvaluationSchema>;

export const ControllerDecisionSchema = z.object({
  action: NextActionSchema,
  reason: z.string(),
  nextTarget: z.string().optional(),
  shouldComplete: z.boolean(),
});
export type ControllerDecision = z.infer<typeof ControllerDecisionSchema>;

export const EvaluationAndDecisionSchema = z.object({
  evaluation: AnswerEvaluationSchema,
  decision: ControllerDecisionSchema,
});
export type EvaluationAndDecision = z.infer<typeof EvaluationAndDecisionSchema>;
