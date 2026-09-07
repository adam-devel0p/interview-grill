import Anthropic from "@anthropic-ai/sdk";
import { Hono } from "hono";
import { getConfig, type AppConfig } from "./lib/config";
import { registerErrorHandler } from "./lib/errors";
import type { AppEnv } from "./lib/honoEnv";
import interviewsRoute from "./routes/interviews";
import paymentsRoute from "./routes/payments";
import webhooksRoute from "./routes/webhooks";

export interface CreateAppOptions {
  /**
   * Overridable so tests can inject a fake `Anthropic` client (mocking
   * `messages.create` the same way Phase 2's unit tests do) instead of hitting the
   * real API — build-plan §47: `npm test` must never make real Anthropic API calls.
   * Defaults to a real client built from the resolved per-request config.
   */
  anthropicFactory?: (config: AppConfig) => Anthropic;
}

export function createApp(options: CreateAppOptions = {}): Hono<AppEnv> {
  const anthropicFactory = options.anthropicFactory ?? ((config) => new Anthropic({ apiKey: config.anthropicApiKey }));

  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    const config = getConfig(c.env);
    c.set("config", config);
    c.set("anthropic", anthropicFactory(config));
    await next();
  });

  app.get("/api/health", (c) => c.json({ ok: true }));

  app.route("/api/interviews", interviewsRoute);
  app.route("/api/payments", paymentsRoute);
  app.route("/api/webhooks", webhooksRoute);

  registerErrorHandler(app);

  return app;
}

export default createApp();
