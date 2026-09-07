import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createInterview } from "../../../src/worker/lib/db/interviews";
import { listAiUsageForInterview, recordAiUsage } from "../../../src/worker/lib/db/aiUsage";
import { estimateCostUsd } from "../../../src/worker/lib/config";
import { applyTestMigrations } from "../helpers/migrate";

beforeAll(async () => {
  await applyTestMigrations(env.DB);
});

describe("ai_usage repository", () => {
  it("persists a usage record and it's queryable per interview", async () => {
    const interviewId = crypto.randomUUID();
    await createInterview(env.DB, { id: interviewId, cvText: "CV text" });

    const estimatedCostUsd = estimateCostUsd("claude-sonnet-5", 1200, 340);
    const recorded = await recordAiUsage(env.DB, {
      interviewId,
      requestType: "analysis",
      model: "claude-sonnet-5",
      inputTokens: 1200,
      outputTokens: 340,
      estimatedCostUsd,
    });

    const usage = await listAiUsageForInterview(env.DB, interviewId);
    expect(usage).toEqual([recorded]);
    expect(usage[0]?.estimatedCostUsd).toBeCloseTo(estimatedCostUsd);
  });

  it("records usage with no interviewId", async () => {
    const recorded = await recordAiUsage(env.DB, {
      requestType: "report",
      model: "claude-sonnet-5",
      inputTokens: 500,
      outputTokens: 200,
      estimatedCostUsd: estimateCostUsd("claude-sonnet-5", 500, 200),
    });
    expect(recorded.interviewId).toBeNull();
  });

  it("accumulates multiple usage records per interview", async () => {
    const interviewId = crypto.randomUUID();
    await createInterview(env.DB, { id: interviewId, cvText: "CV text" });

    await recordAiUsage(env.DB, {
      interviewId,
      requestType: "interviewer",
      model: "claude-sonnet-5",
      inputTokens: 100,
      outputTokens: 50,
      estimatedCostUsd: estimateCostUsd("claude-sonnet-5", 100, 50),
    });
    await recordAiUsage(env.DB, {
      interviewId,
      requestType: "evaluator",
      model: "claude-sonnet-5",
      inputTokens: 150,
      outputTokens: 60,
      estimatedCostUsd: estimateCostUsd("claude-sonnet-5", 150, 60),
    });

    const usage = await listAiUsageForInterview(env.DB, interviewId);
    expect(usage.map((record) => record.requestType)).toEqual(["interviewer", "evaluator"]);
  });
});
