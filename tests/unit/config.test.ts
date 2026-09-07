import { describe, expect, it } from "vitest";
import { estimateCostUsd, getModelFor, type AppConfig } from "../../src/worker/lib/config";

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    environment: "development",
    anthropicApiKey: "test-key",
    analysisModel: "analysis-model",
    interviewModel: "interview-model",
    reportModel: "report-model",
    paymentsEnabled: false,
    lemonSqueezyApiKey: "",
    lemonSqueezyStoreId: "",
    lemonSqueezyVariantId: "",
    lemonSqueezyWebhookSecret: "",
    fullInterviewPriceEur: 9,
    freeAnswerLimit: 3,
    ...overrides,
  };
}

describe("getModelFor", () => {
  it("maps analysis to ANALYSIS_MODEL", () => {
    expect(getModelFor(makeConfig(), "analysis")).toBe("analysis-model");
  });

  it("maps interviewer and evaluator to INTERVIEW_MODEL", () => {
    const config = makeConfig();
    expect(getModelFor(config, "interviewer")).toBe("interview-model");
    expect(getModelFor(config, "evaluator")).toBe("interview-model");
  });

  it("maps report to REPORT_MODEL", () => {
    expect(getModelFor(makeConfig(), "report")).toBe("report-model");
  });
});

describe("estimateCostUsd", () => {
  it("computes cost from known-model input/output pricing", () => {
    // claude-sonnet-5: $3/1M input, $15/1M output
    expect(estimateCostUsd("claude-sonnet-5", 1_000_000, 1_000_000)).toBeCloseTo(18);
  });

  it("returns 0 for 0 tokens", () => {
    expect(estimateCostUsd("claude-sonnet-5", 0, 0)).toBe(0);
  });

  it("falls back to default pricing for an unknown model", () => {
    expect(estimateCostUsd("some-future-model", 1_000_000, 1_000_000)).toBeCloseTo(18);
  });
});
