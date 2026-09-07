import { existsSync, readFileSync } from "node:fs";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline";
import Anthropic from "@anthropic-ai/sdk";

import { analyzeCv } from "../src/worker/lib/ai/analyzer";
import { evaluateAnswer } from "../src/worker/lib/ai/evaluator";
import { generateQuestion, type TranscriptTurn } from "../src/worker/lib/ai/interviewer";
import { generateReport, type ReportTranscriptTurn } from "../src/worker/lib/ai/report";
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
 *   npm run interview:cli -- --cv tests/fixtures/cvs/senior-java-cv.txt [--jd path] [--debug] [--report]
 */

interface CliArgs {
  cv?: string;
  jd?: string;
  debug: boolean;
  model?: string;
  report: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { debug: false, report: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--cv") args.cv = argv[++i];
    else if (arg === "--jd") args.jd = argv[++i];
    else if (arg === "--model") args.model = argv[++i];
    else if (arg === "--debug") args.debug = true;
    else if (arg === "--report") args.report = true;
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

/**
 * A `readline` interface starts flowing/reading its input as soon as it's created —
 * not only when `.question()`/`.on('line')` is called. With piped/file-redirected
 * stdin (used for automated/scripted runs of this harness), every line can already be
 * available near-instantly, well before this script is ready to consume it (there are
 * real network calls — `analyzeCv`, `generateQuestion` — between creating the
 * interface and asking the first question). `rl.question()`'s promise form only starts
 * listening for the *next* `'line'` event at the moment it's called, so any line that
 * arrived earlier fires with no listener attached and is silently dropped — every
 * piped answer after the first network round-trip would be lost, well before ever
 * hitting the previous "EOF closes the interface" edge case. Attaching a persistent
 * `'line'` listener immediately (queuing lines that arrive before they're asked for)
 * fixes this regardless of timing, for both piped and real interactive input.
 */
function createLineReader(): { askLine: (prompt: string) => Promise<string | null>; close: () => void } {
  const rl = createInterface({ input: stdin, output: stdout });
  const queue: string[] = [];
  const waiters: ((line: string | null) => void)[] = [];
  let closed = false;

  rl.on("line", (line) => {
    const waiter = waiters.shift();
    if (waiter) waiter(line);
    else queue.push(line);
  });
  rl.on("close", () => {
    closed = true;
    while (waiters.length > 0) waiters.shift()?.(null);
  });

  return {
    askLine(prompt: string): Promise<string | null> {
      stdout.write(prompt);
      if (queue.length > 0) return Promise.resolve(queue.shift()!);
      if (closed) return Promise.resolve(null);
      return new Promise((resolve) => waiters.push(resolve));
    },
    close: () => rl.close(),
  };
}

async function main(): Promise<void> {
  loadDevVars();
  const args = parseArgs(process.argv.slice(2));

  if (!args.cv) {
    console.error(
      "Usage: npm run interview:cli -- --cv <path> [--jd <path>] [--debug] [--model <model>] [--report]",
    );
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
  const reportModel = process.env.REPORT_MODEL ?? interviewModel;

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
  const reportTranscript: ReportTranscriptTurn[] = [];
  const { askLine, close: closeLineReader } = createLineReader();

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

    const rawAnswer = await askLine("Your answer (or /quit to stop early): ");
    if (rawAnswer === null) break; // stdin closed (EOF) with no more lines queued
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

    reportTranscript.push({ question, answer, evaluation: evaluated.evaluation });

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

  closeLineReader();
  stdout.write(`\n--- Interview complete after ${questionNumber} question(s) ---\n`);
  stdout.write(`Claims tested: ${state.testedClaimIds.length}/${analysis.claims.length}\n`);
  stdout.write(`Strong areas: ${state.strongAreas.join(", ") || "(none)"}\n`);
  stdout.write(`Weak areas: ${state.weakAreas.join(", ") || "(none)"}\n`);
  stdout.write(`Red flags: ${state.redFlags.join(", ") || "(none)"}\n`);
  debugLog(args.debug, "final state:", state);

  if (!args.report) {
    stdout.write("\n(Pass --report to also generate the final candidate report.)\n");
    return;
  }

  stdout.write("\nGenerating report...\n");
  const { data: report, usage: reportUsage } = await generateReport(
    anthropic,
    { analysis, state, transcript: reportTranscript },
    reportModel,
  );
  debugLog(args.debug, "report usage:", reportUsage);
  stdout.write(`\n--- Report ---\n${JSON.stringify(report, null, 2)}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
