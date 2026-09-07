import type Anthropic from "@anthropic-ai/sdk";
import type { CvAnalysis, TechnicalClaim } from "../../../shared/schemas/analysis";
import { EvaluationAndDecisionSchema, type EvaluationAndDecision } from "../../../shared/schemas/evaluation";
import type { InterviewerResponse } from "../../../shared/schemas/interviewer";
import type { InterviewState } from "../../../shared/schemas/interviewState";
import { callStructured, type StructuredAiCallResult } from "./client";

/**
 * Combines build-plan Requests C (Answer Evaluator) and D (Interview Controller) into
 * one AI call per candidate answer (build-plan §34 explicitly allows/recommends this to
 * save cost). Internal only: nothing this module returns is ever shown to the candidate
 * during the interview — callers must not wire `evaluation`/`decision` into any
 * response the client sees mid-interview (only the final report, Phase 6, surfaces a
 * curated summary).
 */

export interface EvaluateAnswerContext {
  question: InterviewerResponse;
  candidateAnswer: string;
  /** The claim this question targeted, if any (usually `question.targetClaimId` resolved). */
  claim?: TechnicalClaim;
  analysis: CvAnalysis;
  state: InterviewState;
}

function buildSystemPrompt(): string {
  return [
    "You are the same experienced senior Java/backend engineer conducting this interview, now privately",
    "evaluating the candidate's last answer and deciding what to do next. This evaluation is internal —",
    "it is never shown to the candidate — so be honest and precise, not encouraging.",
    "",
    "Score the answer 1-10 on each of: technicalAccuracy, depth, clarity, realWorldEvidence, specificity,",
    "seniority (how well the answer matches the seniority the claim/question required), and buzzwordRisk",
    "(how much the answer leans on technically-correct-sounding language without demonstrating real",
    "understanding — higher means more buzzword-y). Ground every score in the specific",
    "question/claim/answer given, not generic Java knowledge.",
    "",
    "Detect vagueness and buzzword-only answers: phrases like \"we used Kafka to decouple our services\",",
    '"Kubernetes gave us scalability", or "we followed SOLID principles" without concrete detail (what',
    "actually changed, what failure mode was solved, what specifically scaled) are low specificity and",
    "high buzzwordRisk — record this as a weakness.",
    "",
    'Detect excessive "we" language that hides the candidate\'s personal contribution. When the answer',
    'relies on "we built/decided/implemented" without clarifying what the candidate personally did,',
    'include a weakness whose text contains a phrase like \'excessive "we" language\' or \'unclear personal',
    "contribution' (use that phrasing, verbatim or close to it, so it can be programmatically recognized",
    "downstream). When you notice a contradiction with something said earlier or with the CV, include a",
    "redFlag whose text contains the word \"contradiction\" or \"inconsistent\".",
    "",
    "strengths/weaknesses/missingConcepts must cite what the candidate actually said — never invent or",
    "assume experience, employers, projects, or technologies beyond the CV and this conversation.",
    "`redFlag` is optional: set it only for a genuinely notable concern from this exchange (contradiction,",
    "clear bluff, factual error) — leave it unset otherwise. Set `interviewerConfidence` to your honest",
    "read of how likely this reflects genuine hands-on experience.",
    "",
    "Then decide what happens next as `decision`:",
    "- FOLLOW_UP: the answer needs more detail or clarification on the same specific point before you can",
    "  judge it.",
    "- GO_DEEPER: the answer was reasonable but there is a deeper, related mechanism worth testing on the",
    "  same claim/thread (chain the questions the way a real interviewer follows an interesting thread —",
    "  alternatives considered, tradeoffs, what broke, what they'd do differently).",
    "- CHALLENGE: the answer was vague, buzzword-heavy, contradictory, or unconvincing — push back",
    "  skeptically for real evidence.",
    "- NEW_TOPIC: this claim/thread has enough evidence (or is exhausted) — move on. Set `nextTarget` to",
    "  the id of the next claim to probe, preferring untested high-risk claims from the list provided.",
    "- CLARIFY: the answer was ambiguous rather than weak — ask a short clarifying question before scoring",
    "  further.",
    "- INTERVIEW_COMPLETE: enough evidence has been gathered overall to stop; set `shouldComplete: true`.",
    "",
    "A full interview targets roughly 12-20 substantive questions (about 15 typically). Do not signal",
    "completion too early just because one claim went well, and do not keep going indefinitely once the",
    "important high-risk claims have real evidence and the question count is well into that range — use",
    "the interview progress summary provided to judge this. `decision.shouldComplete` is a REQUIRED",
    "boolean field — always include it explicitly, even when it is `false` (which is the common case);",
    "it must be `true` if and only if `action` is INTERVIEW_COMPLETE.",
    "",
    "Return your result by calling the provided tool exactly once. The top-level input must have EXACTLY",
    "two keys, `evaluation` and `decision`, each a nested object — never flatten their fields onto the",
    "top level. The shape (values below are illustrative only, not a real answer) is exactly:",
    "{",
    '  "evaluation": {',
    '    "technicalAccuracy": 7, "depth": 6, "clarity": 8, "realWorldEvidence": 6, "specificity": 7,',
    '    "seniority": 7, "buzzwordRisk": 3, "strengths": ["..."], "weaknesses": ["..."],',
    '    "missingConcepts": ["..."], "redFlag": "... (omit this key entirely if none)",',
    '    "interviewerConfidence": "probably_familiar"',
    "  },",
    '  "decision": { "action": "FOLLOW_UP", "reason": "...", "nextTarget": "... (omit if not applicable)", "shouldComplete": false }',
    "}",
  ].join("\n");
}

function summarizeClaim(claim: TechnicalClaim): string {
  return [
    `id: ${claim.id}`,
    `category: ${claim.category}`,
    `riskLevel: ${claim.riskLevel}`,
    `requiredDepth: ${claim.requiredDepth}`,
    `claim: ${claim.text}`,
  ].join("; ");
}

function summarizeProgress(state: InterviewState, totalClaims: number): string {
  return [
    `questionsAsked: ${state.majorQuestionsAsked}`,
    `estimatedCompletion: ${Math.round(state.estimatedCompletion * 100)}%`,
    `claimsTested: ${state.testedClaimIds.length}/${totalClaims}`,
    `candidatePatterns: vague=${state.candidatePatterns.vagueAnswers}, concrete=${state.candidatePatterns.strongConcreteAnswers}, weLanguage=${state.candidatePatterns.excessiveWeLanguage}, buzzwordy=${state.candidatePatterns.buzzwordAnswers}`,
  ].join("\n");
}

function buildUserMessage(ctx: EvaluateAnswerContext): string {
  const { question, candidateAnswer, claim, analysis, state } = ctx;

  const untestedHighRisk = analysis.claims.filter(
    (c) => c.riskLevel === "high" && !state.testedClaimIds.includes(c.id) && c.id !== claim?.id,
  );

  const sections = [
    `<question>\ntext: ${question.question}\nintent: ${question.intent}\ndifficulty: ${question.difficulty}\nexpectedConcepts: ${question.expectedConcepts.join(", ")}\n</question>`,
    `<candidate_answer>\n${candidateAnswer}\n</candidate_answer>`,
  ];

  if (claim) {
    sections.push(`<claim_being_tested>\n${summarizeClaim(claim)}\n</claim_being_tested>`);
  }

  sections.push(`<interview_progress>\n${summarizeProgress(state, analysis.claims.length)}\n</interview_progress>`);

  if (untestedHighRisk.length > 0) {
    sections.push(
      `<untested_high_risk_claims>\n${untestedHighRisk.map(summarizeClaim).join("\n")}\n</untested_high_risk_claims>`,
    );
  }

  return sections.join("\n\n");
}

export async function evaluateAnswer(
  anthropic: Anthropic,
  ctx: EvaluateAnswerContext,
  model: string,
): Promise<StructuredAiCallResult<EvaluationAndDecision>> {
  return callStructured(anthropic, {
    requestType: "evaluator",
    model,
    system: buildSystemPrompt(),
    messages: [{ role: "user", content: buildUserMessage(ctx) }],
    schema: EvaluationAndDecisionSchema,
  });
}
