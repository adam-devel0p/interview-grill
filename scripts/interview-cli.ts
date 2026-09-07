import { existsSync, readFileSync } from "node:fs";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import Anthropic from "@anthropic-ai/sdk";

import { analyzeCv } from "../src/worker/lib/ai/analyzer";
import { evaluateAnswer } from "../src/worker/lib/ai/evaluator";
import { generateQuestion, type TranscriptTurn } from "../src/worker/lib/ai/interviewer";
import { applyEvaluation, initInterviewState } from "../src/worker/lib/interview/state";
import { selectNextClaim, shouldCompleteInterview } from "../src/worker/lib/interview/controller";
import type { TechnicalClaim } from "../src/shared/schemas/analysis";

/**
 * Manual test harness (build-plan §53.9) for a human to run a full interview against
 * the real Anthropic API and judge quality against the First Milestone checklist
 * (build-plan §52). This is the ONLY place in the codebase allowed to make live AI
 * calls — never run by `npm test`.
 *
 * Usage:
 *   npm run interview:cli -- --cv tests/fixtures/cvs/senior-java-cv.txt [--jd path] [--debug]
 */

interface CliArgs {
  cv?: string;
  jd?: string;
  debug: boolean;
  model?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { debug: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--cv") args.cv = argv[++i];
    else if (arg === "--jd") args.jd = argv[++i];
    else if (arg === "--model") args.model = argv[++i];
    else if (arg === "--debug") args.debug = true;
  }
  return args;
}

/** Loads `.dev.vars` (KEY=VALUE per line) into process.env without overriding values already set. */
function loadDevVars(): void {
  if (!existsSync(".dev.vars")) return;
  const contents = readFileSync(".dev.vars", "utf-8");
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function debugLog(enabled: boolean, ...parts: unknown[]): void {
  if (!enabled) return;
  console.error("[debug]", ...parts);
}

async function main(): Promise<void> {
  loadDevVars();
  const args = parseArgs(process.argv.slice(2));

  if (!args.cv) {
    console.error("Usage: npm run interview:cli -- --cv <path> [--jd <path>] [--debug] [--model <model>]");
    process.exit(1);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.length < 30) {
    console.error(
      "ANTHROPIC_API_KEY is missing or looks like a placeholder. Set a real key in .dev.vars or the " +
        "environment before running this manual harness (it makes live Anthropic API calls).",
    );
    process.exit(1);
  }

  const anthropic = new Anthropic({ apiKey });
  const interviewModel = args.model ?? process.env.INTERVIEW_MODEL ?? "claude-sonnet-5";
  const analysisModel = process.env.ANALYSIS_MODEL ?? interviewModel;

  const cvText = readFileSync(args.cv, "utf-8");
  const jobDescription = args.jd ? readFileSync(args.jd, "utf-8") : undefined;

  console.error("Analyzing CV...");
  const { data: analysis, usage: analysisUsage } = await analyzeCv(
    anthropic,
    { cvText, jobDescription },
    analysisModel,
  );
  const highRiskCount = analysis.claims.filter((c) => c.riskLevel === "high").length;
  console.error(
    `Extracted ${analysis.claims.length} claims (${highRiskCount} high risk), ` +
      `estimated seniority: ${analysis.estimatedSeniority}.`,
  );
  debugLog(args.debug, "analysis usage:", analysisUsage);

  let state = initInterviewState(analysis);
  const transcript: TranscriptTurn[] = [];
  const rl = createInterface({ input: stdin, output: stdout });

  let activeClaim: TechnicalClaim | undefined = selectNextClaim(state, analysis);
  let questionNumber = 0;

  while (activeClaim || state.testedClaimIds.length < analysis.claims.length) {
    const { data: question, usage: questionUsage } = await generateQuestion(
      anthropic,
      { analysis, state, activeClaim, recentTranscript: transcript },
      interviewModel,
    );
    questionNumber++;
    stdout.write(`\n--- Question ${questionNumber} ---\n${question.question}\n\n`);
    debugLog(
      args.debug,
      `intent=${question.intent} difficulty=${question.difficulty} targetClaimId=${question.targetClaimId}`,
      "usage:",
      questionUsage,
    );
    transcript.push({ role: "interviewer", content: question.question });

    let rawAnswer: string;
    try {
      rawAnswer = await rl.question("Your answer (or /quit to stop early): ");
    } catch (err) {
      // Piped/non-interactive stdin can hit EOF and auto-close the readline interface
      // before this call runs; treat that the same as the user quitting rather than
      // crashing with a raw ERR_USE_AFTER_CLOSE stack trace.
      if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ERR_USE_AFTER_CLOSE") break;
      throw err;
    }
    const answer = rawAnswer.trim();
    if (answer === "/quit") break;
    transcript.push({ role: "candidate", content: answer });

    const claimForQuestion = question.targetClaimId
      ? analysis.claims.find((c) => c.id === question.targetClaimId)
      : activeClaim;

    const { data: evaluated, usage: evalUsage } = await evaluateAnswer(
      anthropic,
      { question, candidateAnswer: answer, claim: claimForQuestion, analysis, state },
      interviewModel,
    );
    debugLog(args.debug, "evaluation:", evaluated.evaluation);
    debugLog(args.debug, "decision:", evaluated.decision, "usage:", evalUsage);

    state = applyEvaluation(state, {
      claimId: claimForQuestion?.id,
      category: claimForQuestion?.category,
      evaluation: evaluated.evaluation,
      decision: evaluated.decision,
    });

    if (evaluated.decision.action === "INTERVIEW_COMPLETE" || shouldCompleteInterview(state, analysis)) {
      break;
    }

    if (evaluated.decision.action === "NEW_TOPIC") {
      const targeted = evaluated.decision.nextTarget
        ? analysis.claims.find((c) => c.id === evaluated.decision.nextTarget)
        : undefined;
      activeClaim = targeted ?? selectNextClaim(state, analysis);
    } else {
      activeClaim = claimForQuestion ?? activeClaim;
    }
  }

  rl.close();
  stdout.write(`\n--- Interview complete after ${questionNumber} question(s) ---\n`);
  stdout.write(`Claims tested: ${state.testedClaimIds.length}/${analysis.claims.length}\n`);
  stdout.write(`Strong areas: ${state.strongAreas.join(", ") || "(none)"}\n`);
  stdout.write(`Weak areas: ${state.weakAreas.join(", ") || "(none)"}\n`);
  stdout.write(`Red flags: ${state.redFlags.join(", ") || "(none)"}\n`);
  debugLog(args.debug, "final state:", state);
  stdout.write("\n(Report generation is Phase 6 — not yet wired into this CLI.)\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
