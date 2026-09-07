import type { CvAnalysis, TechnicalClaim } from "../../../shared/schemas/analysis";
import type { InterviewState } from "../../../shared/schemas/interviewState";

/**
 * build-plan §19 target range for a full interview is 12-20 substantive questions.
 * `MAX_QUESTIONS` is a hard cap (always complete once hit); `MIN_QUESTIONS_BEFORE_EARLY_COMPLETION`
 * guards against ending early just because a CV happens to have very few high-risk
 * claims to test.
 */
const MAX_QUESTIONS = 20;
const MIN_QUESTIONS_BEFORE_EARLY_COMPLETION = 12;
const ESTIMATED_COMPLETION_THRESHOLD = 0.9;

/**
 * Fallback/backstop completion heuristics (build-plan §19). In normal operation the AI
 * already drives completion: `applyEvaluation` (state.ts) forces
 * `state.estimatedCompletion` to 1 the moment the evaluator/controller AI call signals
 * `decision.shouldComplete`, which immediately satisfies this function's first
 * condition — so **the AI's explicit signal wins by default**. The
 * majorQuestionsAsked/all-high-risk-tested checks below only matter as a safety net
 * for interviews where the AI never signals completion (e.g. it keeps finding new
 * threads to pull on past a reasonable length).
 */
export function shouldCompleteInterview(state: InterviewState, analysis: CvAnalysis): boolean {
  if (state.estimatedCompletion >= ESTIMATED_COMPLETION_THRESHOLD) return true;
  if (state.majorQuestionsAsked >= MAX_QUESTIONS) return true;

  const highRiskClaimIds = analysis.claims.filter((claim) => claim.riskLevel === "high").map((claim) => claim.id);
  const allHighRiskTested =
    highRiskClaimIds.length > 0 && highRiskClaimIds.every((id) => state.testedClaimIds.includes(id));
  if (allHighRiskTested && state.majorQuestionsAsked >= MIN_QUESTIONS_BEFORE_EARLY_COMPLETION) return true;

  return false;
}

/**
 * Picks the next untested claim to focus on when the AI's NEW_TOPIC decision doesn't
 * specify a valid target itself. Priority order:
 *   1. untested high-risk claims that also cover a `jobMatch.interviewPriorities` topic
 *   2. remaining untested high-risk claims
 *   3. untested claims (any risk level) covering an interview priority
 *   4. everything else, in the CV analysis's original order
 * Within a tier, original `analysis.claims` order is preserved (deterministic).
 * "Covers a priority" is a case-insensitive substring match of each priority string
 * (or its individual words, for short technology names) against the claim's text,
 * category, project, and likely questions — a deliberately simple heuristic, not NLP.
 */
export function selectNextClaim(state: InterviewState, analysis: CvAnalysis): TechnicalClaim | undefined {
  const untested = analysis.claims.filter((claim) => !state.testedClaimIds.includes(claim.id));
  if (untested.length === 0) return undefined;

  const priorities = (analysis.jobMatch?.interviewPriorities ?? []).map((priority) => priority.toLowerCase());
  const matchesPriority = (claim: TechnicalClaim): boolean => {
    if (priorities.length === 0) return false;
    const haystack = [claim.text, claim.category, claim.project ?? "", ...claim.likelyQuestions]
      .join(" ")
      .toLowerCase();
    return priorities.some((priority) => {
      if (haystack.includes(priority)) return true;
      return priority.split(/\s+/).some((word) => word.length >= 4 && haystack.includes(word));
    });
  };

  const tiers: TechnicalClaim[][] = [[], [], [], []];
  for (const claim of untested) {
    const highRisk = claim.riskLevel === "high";
    const priorityMatch = matchesPriority(claim);
    if (highRisk && priorityMatch) tiers[0]!.push(claim);
    else if (highRisk) tiers[1]!.push(claim);
    else if (priorityMatch) tiers[2]!.push(claim);
    else tiers[3]!.push(claim);
  }

  for (const tier of tiers) {
    if (tier.length > 0) return tier[0];
  }
  return undefined;
}
