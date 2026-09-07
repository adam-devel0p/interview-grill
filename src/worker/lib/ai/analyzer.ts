import type Anthropic from "@anthropic-ai/sdk";
import { CvAnalysisSchema, type CvAnalysis } from "../../../shared/schemas/analysis";
import { callStructured, type StructuredAiCallResult } from "./client";

/**
 * Input length limits this module assumes have already been enforced by the caller
 * (Phase 8's API route validates the request body before calling `analyzeCv` — this
 * module does not itself reject long input). Exported so Phase 8 stays consistent
 * with the limits this prompt was designed/tested around (build-plan §38).
 */
export const CV_MIN_LENGTH = 200;
export const CV_MAX_LENGTH = 20_000;
export const JOB_DESCRIPTION_MAX_LENGTH = 10_000;

export interface AnalyzeCvInput {
  cvText: string;
  jobDescription?: string;
}

const CLAIM_CATEGORIES = [
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
].join(", ");

function buildSystemPrompt(hasJobDescription: boolean): string {
  const jobMatchInstructions = hasJobDescription
    ? [
        "A job description is also provided, delimited by <job_description>. Additionally populate",
        "`jobMatch`: a 0-100 `roleMatchScore`, the `requiredTechnologies` the job description asks for,",
        "`strongMatches` and `partialMatches` between the CV and those requirements, real `gaps`,",
        "`skillsMaybeNotDeepEnough` (technologies the CV name-drops but doesn't demonstrate depth on relative",
        "to this specific role), and `interviewPriorities` (what a senior interviewer hiring for *this* role",
        "should spend the limited interview time probing).",
      ].join(" ")
    : "No job description was provided. Do not populate `jobMatch` and do not invent one.";

  return [
    "You are an experienced senior Java/backend engineer doing interview prep, not a resume summarizer.",
    "Your job is to read this CV the way a skeptical senior interviewer would: identify every claim you",
    "could challenge the candidate to defend, and separate genuine, evidenced experience from claims that",
    "merely sound impressive.",
    "",
    "You may infer interview risk from the candidate's statements, but you must never invent facts about",
    "their employment, project architecture, responsibilities or technologies. If something is unclear or",
    "underspecified, that is itself a reason to flag it for the interview to probe — do not silently assume",
    "detail the CV does not state.",
    "",
    "Extract a `TechnicalClaim` for anything in the CV a senior interviewer could reasonably ask the",
    "candidate to defend — architecture decisions, performance claims, scale/numbers, technology choices,",
    "leadership/ownership statements, and so on — covering as many of these categories as the CV actually",
    `touches: ${CLAIM_CATEGORIES}. For each claim:`,
    "- `sourceExcerpt` must be an actual substring or a close, faithful paraphrase of text in the CV — never",
    "  fabricated.",
    "- `riskLevel` reflects how likely the claim is to fall apart under senior-level questioning (vague,",
    "  buzzword-heavy, unusually strong for the candidate's apparent seniority, or otherwise exaggeration-prone",
    "  claims are higher risk; concrete, specific, evidenced claims are lower risk).",
    "- `confidence` (0-1) is your confidence, as the interviewer, that the candidate genuinely has the depth",
    "  the claim implies.",
    "- `reasoning` briefly explains the risk/confidence call.",
    "- `likelyQuestions` are real follow-up questions a senior interviewer would actually ask to test this",
    "  claim — specific to this candidate's stated project/numbers/technology, not generic trivia.",
    "- `requiredDepth` is the depth of understanding expected given the candidate's apparent seniority and",
    "  how central this claim is.",
    "",
    "Separately, collect `vagueClaims`: statements that use technically-correct-sounding language without",
    'demonstrating real understanding — e.g. "improved performance", "worked with AWS", "followed best',
    'practices" — phrases too generic to turn into a well-targeted `TechnicalClaim` on their own, but worth',
    "flagging as bullshit-detector bait. Keep these distinct from `claims`.",
    "",
    "Also assess the CV as a whole: `estimatedSeniority`, an optional `yearsExperienceEstimate`,",
    "`primaryStack` (the core technologies this candidate's identity is built on), the fuller `technologies`",
    "list, and `projects` (name + description) the CV describes.",
    "",
    jobMatchInstructions,
    "",
    "Return your findings by calling the provided tool exactly once with the complete structured result.",
  ].join("\n");
}

function buildUserMessage(input: AnalyzeCvInput): string {
  const sections = [`<candidate_cv>\n${input.cvText}\n</candidate_cv>`];
  if (input.jobDescription) {
    sections.push(`<job_description>\n${input.jobDescription}\n</job_description>`);
  }
  return sections.join("\n\n");
}

export async function analyzeCv(
  anthropic: Anthropic,
  input: AnalyzeCvInput,
  model: string,
): Promise<StructuredAiCallResult<CvAnalysis>> {
  return callStructured(anthropic, {
    requestType: "analysis",
    model,
    system: buildSystemPrompt(Boolean(input.jobDescription)),
    messages: [{ role: "user", content: buildUserMessage(input) }],
    schema: CvAnalysisSchema,
    // A realistic senior CV can produce a dozen-plus claims, each with reasoning and
    // several likelyQuestions — well past callStructured's 4096-token default, which
    // truncates the structured output mid-generation. Found via Phase 5's manual
    // milestone run against the real API (see that phase's Completion Report).
    maxTokens: 8192,
  });
}
