import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../../src/worker/index";

describe("GET /api/health", () => {
  it("returns ok: true", async () => {
    const res = await app.request("/api/health", {}, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("SPA fallback for non-API routes", () => {
  // Deep-linking to a client route (e.g. `/interview/:id`) must resolve to the SPA
  // shell via the `ASSETS` binding, not Hono's own 404 — verified manually against a
  // real build (see Phase 10's Completion Report) since `ASSETS.fetch` needs a built
  // `dist/client`, which `npm test` doesn't assume. This test only pins down that the
  // fallback route defers to `ASSETS` rather than never being reached at all.
  it("routes an unmatched non-API GET through the ASSETS binding, not Hono's default 404", async () => {
    const res = await app.request("/interview/some-id", {}, env);
    expect(await res.text()).not.toBe("404 Not Found");
  });

  it("still 404s for an unmatched API route without touching ASSETS", async () => {
    const res = await app.request("/api/does-not-exist", {}, env);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("404 Not Found");
  });
});
