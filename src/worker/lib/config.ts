import type { AiRequestType } from "./ai/client";

export interface AppConfig {
  environment: "development" | "production";
  anthropicApiKey: string;
  analysisModel: string;
  interviewModel: string;
  reportModel: string;
  paymentsEnabled: boolean;
  lemonSqueezyApiKey: string;
  lemonSqueezyStoreId: string;
  lemonSqueezyVariantId: string;
  lemonSqueezyWebhookSecret: string;
  fullInterviewPriceEur: number;
  freeAnswerLimit: number;
}

function requireInProduction(key: string, value: string | undefined, isProduction: boolean): string {
  if (!value) {
    if (isProduction) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return "";
  }
  return value;
}

export function getConfig(env: Env): AppConfig {
  const environment: AppConfig["environment"] = env.ENVIRONMENT === "production" ? "production" : "development";
  const isProduction = environment === "production";

  return {
    environment,
    anthropicApiKey: requireInProduction("ANTHROPIC_API_KEY", env.ANTHROPIC_API_KEY, isProduction),
    analysisModel: env.ANALYSIS_MODEL || "claude-sonnet-5",
    interviewModel: env.INTERVIEW_MODEL || "claude-sonnet-5",
    reportModel: env.REPORT_MODEL || "claude-sonnet-5",
    paymentsEnabled: env.PAYMENTS_ENABLED === "true",
    lemonSqueezyApiKey: env.LEMON_SQUEEZY_API_KEY ?? "",
    lemonSqueezyStoreId: env.LEMON_SQUEEZY_STORE_ID ?? "",
    lemonSqueezyVariantId: env.LEMON_SQUEEZY_VARIANT_ID ?? "",
    lemonSqueezyWebhookSecret: env.LEMON_SQUEEZY_WEBHOOK_SECRET ?? "",
    fullInterviewPriceEur: env.FULL_INTERVIEW_PRICE_EUR ? Number(env.FULL_INTERVIEW_PRICE_EUR) : 9,
    freeAnswerLimit: env.FREE_ANSWER_LIMIT ? Number(env.FREE_ANSWER_LIMIT) : 3,
  };
}

/**
 * Maps an AI request type to the configured model for it. "interviewer" and
 * "evaluator" share `INTERVIEW_MODEL` since both drive the live interview turn.
 */
export function getModelFor(config: AppConfig, requestType: AiRequestType): string {
  switch (requestType) {
    case "analysis":
      return config.analysisModel;
    case "interviewer":
    case "evaluator":
      return config.interviewModel;
    case "report":
      return config.reportModel;
  }
}
