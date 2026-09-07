import type Anthropic from "@anthropic-ai/sdk";
import type { AppConfig } from "./config";

/**
 * Per-request context set by `createApp`'s middleware (`src/worker/index.ts`) — every
 * route handler reads `config`/`anthropic` via `c.get(...)` rather than constructing
 * them itself, so tests can inject a fake `anthropic` client without touching route
 * code (build-plan §47: `npm test` must never make real Anthropic API calls).
 */
export interface AppVariables {
  anthropic: Anthropic;
  config: AppConfig;
}

export type AppEnv = { Bindings: Env; Variables: AppVariables };
