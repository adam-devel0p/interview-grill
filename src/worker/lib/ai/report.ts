import type Anthropic from "@anthropic-ai/sdk";
import type { CvAnalysis, TechnicalClaim } from "../../../shared/schemas/analysis";
import type { AnswerEvaluation } from "../../../shared/schemas/evaluation";
import type { InterviewerResponse } from "../../../shared/schemas/interviewer";
import type { InterviewState } from "../../../shared/schemas/interviewState";
import { ReportSchema, type Report } from "../../../shared/schemas/report";
import { callStructured, type StructuredAiCallResult } from "./client";

/**
 * Turns a completed interview (CV analysis + final state + transcript with per-answer
 * evaluations) into the candidate-facing `Report` (Section 4.6, build-plan §22-§30).
 * This is the last AI call of an interview — nothing here feeds back into the live
 * interview loop, so unlike the evaluator, everything this module returns is meant to
 * eventually reach the candidate.
 */

export interface ReportTranscriptTurn {
  question: InterviewerResponse;
  answer: string;
  evaluation: AnswerEvaluation;
}

export interface GenerateReportContext {
  analysis: CvAnalysis;
  state: InterviewState;
  transcript: ReportTranscriptTurn[];
}

/**
 * Long answers are truncated in the prompt to keep token usage bounded (build-plan
 * §33/§38) — the evaluation summary sent alongside every turn already captures what a
 * generic report needs, so only enough raw answer text to quote/ground `betterAnswers`
 * and `claimRisk.explanation` is kept. Unlike Phase 5's bounded transcript *window*
 * (only the last few turns), the report needs the *whole* interview, since it's a
 * single end-of-interview summary rather than a per-turn adaptive decision.
 */
const MAX_ANSWER_CHARS_IN_PROMPT = 900;

function truncate(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars)}... [truncated]` : text;
}

/** Ids of every claim that was actually asked about during the interview and so has real
 * evidence behind it — the union of Phase 4's `testedClaimIds` (claims the controller
 * considered "done") and every claim ever targeted by a question in the transcript. The
 * union matters because an interview can end (time/question-count limits, or the
 * candidate quitting) while a claim is mid-`FOLLOW_UP`/`CLARIFY` — Phase 4's bookkeeping
 * rule (see its Completion Report) never promotes such a claim into `testedClaimIds`,
 * but the transcript still holds real Q&A evidence for it that the report must not
 * silently drop.
 */
function testedClaimIds(state: InterviewState, transcript: ReportTranscriptTurn[]): Set<string> {
  const ids = new Set(state.testedClaimIds);
  for (const turn of transcript) {
    if (turn.question.targetClaimId) ids.add(turn.question.targetClaimId);
  }
  return ids;
}

function buildSystemPrompt(hasJobDescription: boolean): string {
  const roleFitInstructions = hasJobDescription
    ? [
        "A job description was supplied for this candidate, so also populate `roleFit`: an",
        "`estimatedFitPercent`, `strongMatch`/`partialMatch`/`concerns` against that specific role, and",
        "`likelyCompanyQuestions` this company would plausibly ask given the role and this interview.",
      ].join(" ")
    : "No job description was supplied for this candidate. Omit `roleFit` entirely — do not invent one.";

  return [
    "You are the same experienced senior Java/backend engineer who conducted this technical interview,",
    "now writing the candidate's final debrief report. Unlike your questions and internal evaluations",
    "during the interview, everything you write now IS shown to the candidate — write it directly to them,",
    "professionally and honestly, the way a good senior engineer would debrief someone after a real",
    "interview loop: candid, specific, and useful, never childish or sugar-coated.",
    "",
    "Base every claim in this report ONLY on the CV, the interview transcript, and the evaluations you are",
    "given. You must never invent facts, employers, projects, technologies, or events not present in that",
    "material. Only score, discuss, or list risk for claims that were actually asked about during this interview —",
    "you are given the exact list of claim ids that were tested; do not fabricate scores or risk for CV",
    "claims that were never tested (there is no evidence for them either way).",
    "",
    "`overallReadiness` (0-100) and `categoryScores` (one entry per category actually tested, keyed by the",
    "same category names used in the CV analysis) should reflect the real performance shown, not CV",
    "content alone. `verdict.status` is one of STRONG, INTERVIEW_READY, MOSTLY_READY, NEEDS_PREPARATION,",
    "HIGH_RISK, with a concise `summary` that names specific real strengths/gaps from this interview.",
    "",
    "`claimRisk`: one entry per tested claim (from the exact list provided), each with a `status` of SAFE,",
    "NEEDS_PRACTICE, or HIGH_RISK, and an `explanation` grounded in how the candidate actually answered.",
    "Only include `suggestedCvFraming` when it is genuinely justified by how the claim held up (e.g. the CV",
    "overstates something the interview showed was thinner) — do not add it reflexively to every entry.",
    "",
    "`redFlags` and `strongAreas` are both required arrays, but only ever include entries backed by real",
    "evidence from this transcript — an empty array is correct and expected if there is nothing genuine to",
    "report in that category. Do not pad `strongAreas` with generic positivity to avoid an empty list, and",
    "do not manufacture a `redFlags` entry just to have one; equally, if there IS genuine evidence of either,",
    "you must include it — a report that is purely critical (no real strengths reported) is as wrong as one",
    "that hides real red flags.",
    "",
    "`betterAnswers`: for a few of the candidate's weaker answers, show what a strong answer would have",
    "covered structurally (`strongerAnswerStructure`, a short ordered list of points). If any of that",
    "illustrative content is written by you as an example rather than something the candidate said or a",
    "restatement of established fact, set `isExample: true` on that entry and make the text itself read as",
    "clearly illustrative (e.g. \"a strong answer would typically...\") — never let generated example content",
    "be mistaken for a claim about what the candidate actually did.",
    "",
    "`likelyFollowUpQuestions`: 1-10 further questions a real interviewer would plausibly ask this specific",
    "candidate next, grounded in their CV and how this interview went.",
    "",
    "`studyPriorities`: ordered by `priority` (1 = highest), each with a rough `estimatedMinutes` and",
    "concrete `reviewItems`. Use `note` to distinguish genuinely different situations — e.g. a topic the",
    "candidate plainly does not know versus a topic they do know but described in a way that overstated",
    "their personal involvement (the CV said \"we used AWS extensively\" but the interview showed only",
    "shallow, secondhand familiarity) — these need different advice (learn the material vs. reframe the CV",
    "and be ready to speak precisely about actual personal scope).",
    "",
    roleFitInstructions,
    "",
    "Return your findings by calling the provided tool exactly once with the complete structured result.",
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

function summarizeEvaluation(evaluation: AnswerEvaluation): string {
  return [
    `scores(technicalAccuracy=${evaluation.technicalAccuracy}, depth=${evaluation.depth}, clarity=${evaluation.clarity}, realWorldEvidence=${evaluation.realWorldEvidence}, specificity=${evaluation.specificity}, seniority=${evaluation.seniority}, buzzwordRisk=${evaluation.buzzwordRisk})`,
    evaluation.strengths.length > 0 ? `strengths: ${evaluation.strengths.join(" | ")}` : undefined,
    evaluation.weaknesses.length > 0 ? `weaknesses: ${evaluation.weaknesses.join(" | ")}` : undefined,
    evaluation.missingConcepts.length > 0 ? `missingConcepts: ${evaluation.missingConcepts.join(" | ")}` : undefined,
    evaluation.redFlag ? `redFlag: ${evaluation.redFlag}` : undefined,
    `interviewerConfidence: ${evaluation.interviewerConfidence}`,
  ]
    .filter((part): part is string => Boolean(part))
    .join("; ");
}

function summarizeTranscriptTurn(turn: ReportTranscriptTurn, index: number, analysis: CvAnalysis): string {
  const claim = turn.question.targetClaimId
    ? analysis.claims.find((c) => c.id === turn.question.targetClaimId)
    : undefined;
  return [
    `--- Turn ${index + 1} ---`,
    claim ? `claim: ${summarizeClaim(claim)}` : `claim: (none — general/transition question)`,
    `Q: ${turn.question.question}`,
    `A: ${truncate(turn.answer, MAX_ANSWER_CHARS_IN_PROMPT)}`,
    `evaluation: ${summarizeEvaluation(turn.evaluation)}`,
  ].join("\n");
}

function summarizeState(state: InterviewState): string {
  return [
    `candidateSeniority: ${state.candidateSeniority}`,
    `majorQuestionsAsked: ${state.majorQuestionsAsked}`,
    state.strongAreas.length > 0 ? `strongAreas: ${state.strongAreas.join(" | ")}` : undefined,
    state.weakAreas.length > 0 ? `weakAreas: ${state.weakAreas.join(" | ")}` : undefined,
    state.redFlags.length > 0 ? `redFlags: ${state.redFlags.join(" | ")}` : undefined,
    state.contradictions.length > 0 ? `contradictions: ${state.contradictions.join(" | ")}` : undefined,
    state.conceptsToProbe.length > 0 ? `conceptsToProbe: ${state.conceptsToProbe.join(" | ")}` : undefined,
    `candidatePatterns: vague=${state.candidatePatterns.vagueAnswers}, concrete=${state.candidatePatterns.strongConcreteAnswers}, weLanguage=${state.candidatePatterns.excessiveWeLanguage}, buzzwordy=${state.candidatePatterns.buzzwordAnswers}`,
    `topicScores: ${
      Object.entries(state.topicScores)
        .map(([category, score]) => `${category}=${score.toFixed(1)}`)
        .join(", ") || "(none)"
    }`,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function buildUserMessage(ctx: GenerateReportContext): string {
  const { analysis, state, transcript } = ctx;
  const testedIds = testedClaimIds(state, transcript);
  const testedClaims = analysis.claims.filter((c) => testedIds.has(c.id));
  const untestedHighRisk = analysis.claims.filter((c) => c.riskLevel === "high" && !testedIds.has(c.id));

  const sections = [
    `<candidate_profile>\nestimatedSeniority: ${analysis.estimatedSeniority}\nprimaryStack: ${analysis.primaryStack.join(", ")}\ntechnologies: ${analysis.technologies.join(", ")}\n</candidate_profile>`,
    `<interview_summary>\n${summarizeState(state)}\n</interview_summary>`,
    `<tested_claim_ids>\nOnly produce claimRisk entries for these ids — nothing else:\n${
      testedIds.size > 0 ? [...testedIds].join(", ") : "(none)"
    }\n</tested_claim_ids>`,
    `<tested_claims>\n${
      testedClaims.length > 0 ? testedClaims.map(summarizeClaim).join("\n") : "(none)"
    }\n</tested_claims>`,
  ];

  if (untestedHighRisk.length > 0) {
    sections.push(
      "<untested_high_risk_claims>\nThese high-risk CV claims were never tested in this interview — there is" +
        " no evidence either way. Do not score them in claimRisk; they may only inform studyPriorities as" +
        " areas worth preparing, phrased as \"not covered in this interview\" rather than a known weakness:\n" +
        untestedHighRisk.map(summarizeClaim).join("\n") +
        "\n</untested_high_risk_claims>",
    );
  }

  if (analysis.vagueClaims.length > 0) {
    sections.push(`<vague_cv_claims>\n${analysis.vagueClaims.join("\n")}\n</vague_cv_claims>`);
  }

  if (analysis.jobMatch) {
    sections.push(
      `<job_match>\nroleMatchScore: ${analysis.jobMatch.roleMatchScore}\nstrongMatches: ${analysis.jobMatch.strongMatches.join(", ")}\npartialMatches: ${analysis.jobMatch.partialMatches.join(", ")}\ngaps: ${analysis.jobMatch.gaps.join(", ")}\nskillsMaybeNotDeepEnough: ${analysis.jobMatch.skillsMaybeNotDeepEnough.join(", ")}\n</job_match>`,
    );
  }

  sections.push(
    `<transcript>\n${
      transcript.length > 0
        ? transcript.map((turn, i) => summarizeTranscriptTurn(turn, i, analysis)).join("\n\n")
        : "(no turns recorded)"
    }\n</transcript>`,
  );

  return sections.join("\n\n");
}

/**
 * Defends against the model including a category/claim it wasn't asked to score,
 * ignoring the schema's optionality on `roleFit`, or hallucinating claim ids — the
 * prompt asks it not to, but this is enforced structurally rather than trusted blindly
 * (build-plan §35 applies to our own post-processing too, not just prompting).
 */
function sanitizeReport(report: Report, ctx: GenerateReportContext): Report {
  const testedIds = testedClaimIds(ctx.state, ctx.transcript);
  const testedCategories = new Set<string>(
    ctx.analysis.claims.filter((c) => testedIds.has(c.id)).map((c) => c.category),
  );

  const categoryScores = Object.fromEntries(
    Object.entries(report.categoryScores).filter(([category]) => testedCategories.has(category)),
  );
  const claimRisk = report.claimRisk.filter((entry) => testedIds.has(entry.claimId));
  const roleFit = ctx.analysis.jobMatch ? report.roleFit : undefined;

  return { ...report, categoryScores, claimRisk, roleFit };
}

export async function generateReport(
  anthropic: Anthropic,
  ctx: GenerateReportContext,
  model: string,
): Promise<StructuredAiCallResult<Report>> {
  const result = await callStructured(anthropic, {
    requestType: "report",
    model,
    system: buildSystemPrompt(Boolean(ctx.analysis.jobMatch)),
    messages: [{ role: "user", content: buildUserMessage(ctx) }],
    schema: ReportSchema,
    // A full report (claimRisk + redFlags + strongAreas + betterAnswers +
    // likelyFollowUpQuestions + studyPriorities, potentially + roleFit) is the largest
    // structured output in the codebase — Phase 5's analyzer truncation bug (see its
    // Completion Report) showed the 4096-token default is not enough for large nested
    // outputs, so this uses the same higher budget.
    maxTokens: 8192,
  });
  return { ...result, data: sanitizeReport(result.data, ctx) };
}
