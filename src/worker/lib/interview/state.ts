import type { ClaimCategory, CvAnalysis } from "../../../shared/schemas/analysis";
import type { AnswerEvaluation, ControllerDecision } from "../../../shared/schemas/evaluation";
import type { InterviewState } from "../../../shared/schemas/interviewState";

/**
 * Pure, deterministic state-transition logic for `InterviewState` (build-plan §19,
 * §33). No AI calls, no I/O — Phase 5's `evaluateAnswer`/`generateQuestion` call these
 * functions before/after their prompts.
 */

// --- topicScores -----------------------------------------------------------
// Composite per-turn score (1-10), weighted toward correctness with depth/specificity
// as secondary signals, then folded into a per-category exponential moving average
// (EMA) so a single weak/strong outlier answer doesn't swing the category score
// wildly. The first evaluation for a category sets the score directly.
const TOPIC_SCORE_WEIGHTS = { technicalAccuracy: 0.4, depth: 0.3, specificity: 0.3 } as const;
const TOPIC_SCORE_EMA_ALPHA = 0.4;

// --- candidatePatterns thresholds (all on the evaluator's 1-10 scales) -----
const BUZZWORD_RISK_THRESHOLD = 7; // buzzwordRisk >= this => "buzzword answer"
const VAGUE_SPECIFICITY_THRESHOLD = 3; // specificity <= this => "vague answer"
const CONCRETE_SPECIFICITY_THRESHOLD = 7;
const CONCRETE_ACCURACY_THRESHOLD = 7;
const CONCRETE_EVIDENCE_THRESHOLD = 7;

// `AnswerEvaluation` (Section 4.4) has no dedicated "excessive we-language" field, so
// it's derived heuristically from the evaluator's `weaknesses` text — the evaluator is
// prompted (Phase 5) to call out unclear personal ownership using language like this.
const WE_LANGUAGE_KEYWORDS = [
  "we-language",
  'excessive "we"',
  '"we" language',
  "individual contribution",
  "personal contribution",
  "unclear ownership",
  "unclear individual role",
  "unclear personal role",
  "team effort",
  "hides personal",
];

// Similarly, `contradictions` (Section 4.5) has no dedicated evaluator field. A
// `redFlag` is treated as a contradiction (in addition to a general red flag) when its
// text names one explicitly.
const CONTRADICTION_KEYWORDS = ["contradict", "inconsistent", "inconsistency"];

// Decisions that mean "still gathering information on the same claim" — a claim isn't
// counted as tested while the interviewer is only following up or asking for
// clarification on it (see `applyEvaluation`'s testedClaimIds rule below).
const ACTIONS_THAT_KEEP_CLAIM_OPEN = new Set<ControllerDecision["action"]>(["FOLLOW_UP", "CLARIFY"]);

// estimatedCompletion: weighted blend of high-risk-claim coverage and question-count
// progress toward build-plan §19's 12-20 question target range (16 = midpoint, used as
// the "full progress" denominator so completion doesn't hit 1.0 right at the floor).
const TARGET_QUESTIONS_FOR_FULL_PROGRESS = 16;
const HIGH_RISK_PROGRESS_WEIGHT = 0.6;
const QUESTIONS_PROGRESS_WEIGHT = 0.4;

export function initInterviewState(analysis: CvAnalysis): InterviewState {
  return {
    candidateSeniority: analysis.estimatedSeniority,
    testedClaimIds: [],
    activeClaimId: undefined,
    topicScores: {},
    strongAreas: [],
    weakAreas: [],
    redFlags: [],
    contradictions: [],
    conceptsToProbe: [],
    candidatePatterns: {
      vagueAnswers: 0,
      strongConcreteAnswers: 0,
      excessiveWeLanguage: 0,
      buzzwordAnswers: 0,
    },
    majorQuestionsAsked: 0,
    estimatedCompletion: 0,
    highRiskClaimIds: analysis.claims.filter((claim) => claim.riskLevel === "high").map((claim) => claim.id),
  };
}

export interface ApplyEvaluationContext {
  /** The claim the just-answered question targeted, if any. */
  claimId?: string;
  /**
   * The category of that claim (deviation from the plan's sketch signature, which
   * only listed `claimId`: `topicScores` is keyed by claim *category*, but
   * `applyEvaluation` has no access to the full `CvAnalysis` to resolve
   * `claimId -> category` itself — see this phase's Completion Report). Callers that
   * have the `TechnicalClaim` on hand (Phase 5's `evaluateAnswer`) pass its
   * `category` through; omit it for topic-only questions with no backing claim.
   */
  category?: ClaimCategory;
  evaluation: AnswerEvaluation;
  decision: ControllerDecision;
}

function dedupPush(list: string[], items: string[]): string[] {
  const result = [...list];
  for (const item of items) {
    if (!result.includes(item)) result.push(item);
  }
  return result;
}

function containsKeyword(texts: string[], keywords: string[]): boolean {
  const haystack = texts.join(" ").toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword));
}

function computeEstimatedCompletion(input: {
  testedClaimIds: string[];
  highRiskClaimIds: string[];
  majorQuestionsAsked: number;
}): number {
  const { testedClaimIds, highRiskClaimIds, majorQuestionsAsked } = input;
  const highRiskProgress =
    highRiskClaimIds.length === 0
      ? 1
      : highRiskClaimIds.filter((id) => testedClaimIds.includes(id)).length / highRiskClaimIds.length;
  const questionsProgress = Math.min(majorQuestionsAsked / TARGET_QUESTIONS_FOR_FULL_PROGRESS, 1);
  const score = HIGH_RISK_PROGRESS_WEIGHT * highRiskProgress + QUESTIONS_PROGRESS_WEIGHT * questionsProgress;
  return Math.max(0, Math.min(1, score));
}

export function applyEvaluation(state: InterviewState, ctx: ApplyEvaluationContext): InterviewState {
  const { claimId, category, evaluation, decision } = ctx;

  // testedClaimIds: a claim is "tested" once the interviewer moves past gathering
  // more evidence on it (any action other than FOLLOW_UP/CLARIFY) — repeated
  // follow-ups on the same claim don't add it, let alone add it more than once.
  let testedClaimIds = state.testedClaimIds;
  if (claimId && !testedClaimIds.includes(claimId) && !ACTIONS_THAT_KEEP_CLAIM_OPEN.has(decision.action)) {
    testedClaimIds = [...testedClaimIds, claimId];
  }

  let topicScores = state.topicScores;
  if (category) {
    const composite =
      evaluation.technicalAccuracy * TOPIC_SCORE_WEIGHTS.technicalAccuracy +
      evaluation.depth * TOPIC_SCORE_WEIGHTS.depth +
      evaluation.specificity * TOPIC_SCORE_WEIGHTS.specificity;
    const previous = topicScores[category];
    const next =
      previous === undefined ? composite : TOPIC_SCORE_EMA_ALPHA * composite + (1 - TOPIC_SCORE_EMA_ALPHA) * previous;
    topicScores = { ...topicScores, [category]: next };
  }

  const strongAreas = dedupPush(state.strongAreas, evaluation.strengths);
  const weakAreas = dedupPush(state.weakAreas, evaluation.weaknesses);
  const conceptsToProbe = dedupPush(state.conceptsToProbe, evaluation.missingConcepts);
  const redFlags = evaluation.redFlag ? dedupPush(state.redFlags, [evaluation.redFlag]) : state.redFlags;
  const contradictions =
    evaluation.redFlag && containsKeyword([evaluation.redFlag], CONTRADICTION_KEYWORDS)
      ? dedupPush(state.contradictions, [evaluation.redFlag])
      : state.contradictions;

  const isVague =
    evaluation.specificity <= VAGUE_SPECIFICITY_THRESHOLD || evaluation.interviewerConfidence === "surface_level";
  const isConcrete =
    evaluation.specificity >= CONCRETE_SPECIFICITY_THRESHOLD &&
    evaluation.technicalAccuracy >= CONCRETE_ACCURACY_THRESHOLD &&
    evaluation.realWorldEvidence >= CONCRETE_EVIDENCE_THRESHOLD;
  const isBuzzwordHeavy = evaluation.buzzwordRisk >= BUZZWORD_RISK_THRESHOLD;
  const usesExcessiveWeLanguage = containsKeyword(evaluation.weaknesses, WE_LANGUAGE_KEYWORDS);

  const candidatePatterns = {
    vagueAnswers: state.candidatePatterns.vagueAnswers + (isVague ? 1 : 0),
    strongConcreteAnswers: state.candidatePatterns.strongConcreteAnswers + (isConcrete ? 1 : 0),
    excessiveWeLanguage: state.candidatePatterns.excessiveWeLanguage + (usesExcessiveWeLanguage ? 1 : 0),
    buzzwordAnswers: state.candidatePatterns.buzzwordAnswers + (isBuzzwordHeavy ? 1 : 0),
  };

  const majorQuestionsAsked = state.majorQuestionsAsked + 1;

  // activeClaimId: NEW_TOPIC moves focus to `decision.nextTarget` (trusted to be a
  // claim id when the AI issues NEW_TOPIC — `selectNextClaim` in controller.ts is the
  // fallback when it isn't/is absent); INTERVIEW_COMPLETE clears it; every other
  // action (FOLLOW_UP/GO_DEEPER/CHALLENGE/CLARIFY) keeps probing the same claim.
  let activeClaimId = state.activeClaimId;
  if (decision.action === "NEW_TOPIC") {
    activeClaimId = decision.nextTarget || undefined;
  } else if (decision.action === "INTERVIEW_COMPLETE") {
    activeClaimId = undefined;
  } else if (claimId) {
    activeClaimId = claimId;
  }

  // estimatedCompletion: the AI's explicit shouldComplete signal is authoritative and
  // forces completion outright; otherwise fall back to the coverage/question-count
  // formula above (see computeEstimatedCompletion and shouldCompleteInterview in
  // controller.ts, which layers its own heuristics on top as a backstop).
  const estimatedCompletion = decision.shouldComplete
    ? 1
    : computeEstimatedCompletion({ testedClaimIds, highRiskClaimIds: state.highRiskClaimIds, majorQuestionsAsked });

  return {
    ...state,
    testedClaimIds,
    topicScores,
    strongAreas,
    weakAreas,
    redFlags,
    contradictions,
    conceptsToProbe,
    candidatePatterns,
    majorQuestionsAsked,
    activeClaimId,
    estimatedCompletion,
  };
}
