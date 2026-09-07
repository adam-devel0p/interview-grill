import { Hono } from "hono";
import type { AppEnv } from "../lib/honoEnv";

/** Stub only — Phase 12 implements real Lemon Squeezy checkout creation. */
const payments = new Hono<AppEnv>();

payments.post("/checkout", (c) =>
  c.json({ error: { code: "NOT_IMPLEMENTED", message: "Payment checkout is not implemented yet." } }, 501),
);

export default payments;
