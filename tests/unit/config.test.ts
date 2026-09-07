import { describe, expect, it } from "vitest";
import { getModelFor, type AppConfig } from "../../src/worker/lib/config";

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
