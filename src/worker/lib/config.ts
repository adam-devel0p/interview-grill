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

interface ModelPricing {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
}

/**
 * Placeholder $/token pricing (USD per 1M tokens) used only to populate
 * `ai_usage.estimated_cost_usd` for cost-visibility purposes (build-plan §38) — not
 * used for billing. Verify against https://www.anthropic.com/pricing before relying on
 * these for real budget alerts; update here (never inline at a call site) if pricing
 * changes.
 */
const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-sonnet-5": { inputPerMillionUsd: 3, outputPerMillionUsd: 15 },
  "claude-opus-5": { inputPerMillionUsd: 15, outputPerMillionUsd: 75 },
  "claude-haiku-4-5-20251001": { inputPerMillionUsd: 1, outputPerMillionUsd: 5 },
};
const DEFAULT_MODEL_PRICING: ModelPricing = { inputPerMillionUsd: 3, outputPerMillionUsd: 15 };

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] ?? DEFAULT_MODEL_PRICING;
  return (inputTokens / 1_000_000) * pricing.inputPerMillionUsd + (outputTokens / 1_000_000) * pricing.outputPerMillionUsd;
}
