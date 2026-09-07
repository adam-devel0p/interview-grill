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

  /**
   * SPA fallback: this Worker's `fetch` handles every incoming request (it's the
   * `main` script for a Worker that also has `[assets]` configured), so nothing ever
   * reaches the assets binding's own `not_found_handling = "single-page-application"`
   * behavior on its own — that setting only applies to requests Cloudflare's router
   * sends straight to ASSETS, which never happens once a Worker script claims the
   * route. Any GET that isn't `/api/*` and doesn't match a built asset (JS/CSS/etc.,
   * which `c.env.ASSETS.fetch` serves directly) must still resolve to the client
   * router's `index.html` shell so deep links and refreshes on routes like
   * `/interview/:id` and `/interview/:id/report` work (build-plan §36 "persistent
   * interview URLs"), not Hono's default 404.
   */
  app.get("*", (c) => {
    if (c.req.path.startsWith("/api/")) return c.notFound();
    return c.env.ASSETS.fetch(c.req.raw);
  });

  registerErrorHandler(app);

  return app;
}

export default createApp();
