import { Hono } from "hono";
import type { AppEnv } from "../lib/honoEnv";

/** Stub only — Phase 12 implements real Lemon Squeezy webhook signature verification/handling. */
const webhooks = new Hono<AppEnv>();

webhooks.post("/lemonsqueezy", (c) =>
  c.json({ error: { code: "NOT_IMPLEMENTED", message: "Lemon Squeezy webhook handling is not implemented yet." } }, 501),
);

export default webhooks;
