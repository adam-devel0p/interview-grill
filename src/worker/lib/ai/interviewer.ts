import type Anthropic from "@anthropic-ai/sdk";
import type { CvAnalysis, TechnicalClaim } from "../../../shared/schemas/analysis";
import type { InterviewState } from "../../../shared/schemas/interviewState";
import { InterviewerResponseSchema, type InterviewerResponse } from "../../../shared/schemas/interviewer";
import { callStructured, type StructuredAiCallResult } from "./client";

/**
 * How many of the most recent transcript turns (interviewer + candidate messages,
 * combined) are sent on every call. Chosen as 6 (~3 Q&A exchanges): enough to keep a
 * chained follow-up thread (build-plan §42 "project grilling") coherent without
 * re-sending the whole conversation — everything older is already folded into the
 * compact `InterviewState` summary (build-plan §33/§38).
 */
export const RECENT_TRANSCRIPT_WINDOW = 6;

export interface TranscriptTurn {
  role: "interviewer" | "candidate";
  content: string;
}

export interface GenerateQuestionContext {
  analysis: CvAnalysis;
  state: InterviewState;
  activeClaim?: TechnicalClaim;
  /** Full transcript so far; only the last `RECENT_TRANSCRIPT_WINDOW` turns are sent. */
  recentTranscript: TranscriptTurn[];
}

const BANNED_ENCOURAGEMENT = ['"Great answer!"', '"Excellent!"', '"That\'s correct!"', '"Nice!"'];

function buildSystemPrompt(): string {
  return [
    "You are an experienced senior Java/backend engineer conducting a live technical interview.",
    "Stay professional, concise, skeptical, curious, and technically strong. You are not rude or",
    "condescending, but you are not a tutor and you do not cheer the candidate on.",
    "",
    `Never respond with generic encouragement such as ${BANNED_ENCOURAGEMENT.join(", ")}, or anything`,
    'equivalent. You may briefly acknowledge a fact is correct in a flat, neutral way (e.g. "Correct.",',
    '"Right.") before immediately continuing with the next probing question — never with enthusiasm.',
    "",
    "Ask ONE question per turn. Every question must be grounded in something specific the candidate",
    "actually claimed on their CV or said earlier in this conversation — never generic trivia. Avoid",
    'textbook questions like "What is dependency injection?" or "What is Kafka?" unless the candidate\'s',
    "own answers specifically justify testing fundamentals. Prefer questions that could only be asked",
    "about *this* candidate's *specific* claim. For example:",
    '- Avoid: "What is an index?" Prefer: "A query that used to return in 50ms now takes four seconds',
    'after the table reached 50 million rows. How do you investigate it?"',
    '- Avoid: "What is Kafka?" Prefer: "Your consumer writes to PostgreSQL before committing its Kafka',
    'offset. Walk me through the failure modes."',
    '- Avoid: "What is dependency injection?" Prefer: "You used Spring dependency injection extensively.',
    'Tell me about a situation where bean lifecycle or proxy behavior caused an actual issue."',
    "",
    "Specific tactics to use where they genuinely fit the conversation (never force one that doesn't):",
    '- Vague or buzzword-heavy answers ("we used Kafka to decouple our services", "Kubernetes gave us',
    'scalability", "we followed SOLID principles") should be challenged for concrete detail: what',
    "exactly changed, what failure mode was solved, what actually scaled and what triggered it.",
    '- When the candidate says "we built/decided/implemented" without clarifying their own role,',
    'sometimes ask directly what they personally were responsible for (e.g. "You keep saying \'we\'.',
    'What part of this design were you personally responsible for?").',
    "- When a thread is interesting (a migration, an incident, a design decision), pull on it with",
    "chained follow-ups the way a real interviewer would: why this approach, what were the",
    "alternatives/tradeoffs, what broke or nearly broke, how was a specific failure scenario handled,",
    "what would you do differently now — rather than moving on after one question.",
    "- Draw on senior-level Java, Spring, databases, Kafka/messaging, microservices, system design,",
    "testing, and production-operations knowledge, but only where it is relevant to what the candidate",
    "actually claimed — never force an unrelated topic in.",
    "",
    "You will be given the candidate's CV analysis, a compact summary of interview progress so far, the",
    "claim currently in focus (if any), and the most recent transcript turns. Ask the single best next",
    "question given all of that. Set `targetClaimId` to the id of the claim this question is about (the",
    "claim in focus, or a newly chosen one when opening a new topic); leave it unset only for a broad",
    "transition question not tied to any single claim. Set `difficulty` to the actual difficulty of the",
    "question you are asking, and `expectedConcepts` to a JSON array of short strings — one entry per",
    "concept a strong, senior-level answer would cover (e.g. [\"idempotency\", \"offset commit ordering\"]),",
    "never a single comma-separated string — this field is used only for internal grading, never shown to",
    "the candidate.",
    "",
    "You may infer interview risk from what the candidate has said, but never invent facts about their",
    "employment, project architecture, responsibilities, or technologies not present in the CV or",
    "transcript.",
    "",
    "Return your question by calling the provided tool exactly once. The shape (values below are",
    "illustrative only, not a real question) is exactly:",
    "{",
    '  "question": "...", "targetClaimId": "claim-4", "intent": "...", "difficulty": "intermediate",',
    '  "expectedConcepts": ["concept one", "concept two"]',
    "}",
    "`expectedConcepts` must be a JSON array of short strings as shown — never a single comma-separated",
    "string.",
  ].join("\n");
}

function summarizeClaim(claim: TechnicalClaim): string {
  const parts = [
    `id: ${claim.id}`,
    `category: ${claim.category}`,
    `riskLevel: ${claim.riskLevel}`,
    `requiredDepth: ${claim.requiredDepth}`,
    claim.project ? `project: ${claim.project}` : undefined,
    `claim: ${claim.text}`,
    `sourceExcerpt: "${claim.sourceExcerpt}"`,
    claim.likelyQuestions.length > 0
      ? `example angles an interviewer might use: ${claim.likelyQuestions.join(" | ")}`
      : undefined,
  ].filter((part): part is string => Boolean(part));
  return parts.join("; ");
}

function summarizeState(state: InterviewState, totalClaims: number): string {
  return [
    `candidateSeniority: ${state.candidateSeniority}`,
    `questionsAsked: ${state.majorQuestionsAsked}`,
    `estimatedCompletion: ${Math.round(state.estimatedCompletion * 100)}%`,
    `claimsTested: ${state.testedClaimIds.length}/${totalClaims}`,
    state.strongAreas.length > 0 ? `strongAreas: ${state.strongAreas.join(" | ")}` : undefined,
    state.weakAreas.length > 0 ? `weakAreas: ${state.weakAreas.join(" | ")}` : undefined,
    state.conceptsToProbe.length > 0 ? `conceptsStillWorthProbing: ${state.conceptsToProbe.join(" | ")}` : undefined,
    state.redFlags.length > 0 ? `redFlagsSoFar: ${state.redFlags.join(" | ")}` : undefined,
    `candidatePatterns: vague=${state.candidatePatterns.vagueAnswers}, concrete=${state.candidatePatterns.strongConcreteAnswers}, weLanguage=${state.candidatePatterns.excessiveWeLanguage}, buzzwordy=${state.candidatePatterns.buzzwordAnswers}`,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function buildUserMessage(ctx: GenerateQuestionContext): string {
  const { analysis, state, activeClaim } = ctx;
  const recentTranscript = ctx.recentTranscript.slice(-RECENT_TRANSCRIPT_WINDOW);

  const untestedClaims = analysis.claims.filter((claim) => !state.testedClaimIds.includes(claim.id));

  const sections = [
    `<candidate_profile>\nestimatedSeniority: ${analysis.estimatedSeniority}\nprimaryStack: ${analysis.primaryStack.join(", ")}\n</candidate_profile>`,
    `<interview_progress>\n${summarizeState(state, analysis.claims.length)}\n</interview_progress>`,
  ];

  if (activeClaim) {
    sections.push(`<current_focus_claim>\n${summarizeClaim(activeClaim)}\n</current_focus_claim>`);
  } else if (untestedClaims.length > 0) {
    sections.push(
      "<untested_claims>\nNo single claim is currently in focus. Choose the most valuable one below to open" +
        " next (prioritizing high risk and, if present, job-match priorities) and set targetClaimId" +
        " accordingly:\n" +
        untestedClaims.map(summarizeClaim).join("\n") +
        "\n</untested_claims>",
    );
  }

  if (analysis.jobMatch && analysis.jobMatch.interviewPriorities.length > 0) {
    sections.push(
      `<job_match_priorities>\n${analysis.jobMatch.interviewPriorities.join("\n")}\n</job_match_priorities>`,
    );
  }

  if (recentTranscript.length > 0) {
    const formatted = recentTranscript
      .map((turn) => `${turn.role === "interviewer" ? "Interviewer" : "Candidate"}: ${turn.content}`)
      .join("\n\n");
    sections.push(`<recent_transcript>\n${formatted}\n</recent_transcript>`);
  } else {
    sections.push("<recent_transcript>\nThis is the first question of the interview.\n</recent_transcript>");
  }

  return sections.join("\n\n");
}

export async function generateQuestion(
  anthropic: Anthropic,
  ctx: GenerateQuestionContext,
  model: string,
): Promise<StructuredAiCallResult<InterviewerResponse>> {
  const result = await callStructured(anthropic, {
    requestType: "interviewer",
    model,
    system: buildSystemPrompt(),
    messages: [{ role: "user", content: buildUserMessage(ctx) }],
    schema: InterviewerResponseSchema,
  });

  // Robustness backfill: if the model targeted the claim currently in focus but
  // omitted `targetClaimId` (schema allows it to be optional), default it rather than
  // silently losing the claim association for Phase 4's `applyEvaluation`.
  if (!result.data.targetClaimId && ctx.activeClaim) {
    return { ...result, data: { ...result.data, targetClaimId: ctx.activeClaim.id } };
  }
  return result;
}
