import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createInterview } from "../../../src/worker/lib/db/interviews";
import {
  DuplicatePaymentError,
  getPaymentByProviderOrderId,
  listPaymentsForInterview,
  recordPayment,
} from "../../../src/worker/lib/db/payments";
import { applyTestMigrations } from "../helpers/migrate";

beforeAll(async () => {
  await applyTestMigrations(env.DB);
});

describe("payments repository", () => {
  it("records a payment and finds it by (provider, providerOrderId)", async () => {
    const interviewId = crypto.randomUUID();
    await createInterview(env.DB, { id: interviewId, cvText: "CV text" });

    const recorded = await recordPayment(env.DB, {
      id: crypto.randomUUID(),
      interviewId,
      provider: "lemonsqueezy",
      providerOrderId: "order-123",
      amount: 900,
      currency: "EUR",
      status: "paid",
    });

    const found = await getPaymentByProviderOrderId(env.DB, "lemonsqueezy", "order-123");
    expect(found).toEqual(recorded);
  });

  it("returns null when no payment matches the (provider, providerOrderId)", async () => {
    const found = await getPaymentByProviderOrderId(env.DB, "lemonsqueezy", "does-not-exist");
    expect(found).toBeNull();
  });

  it("throws DuplicatePaymentError on a second payment with the same (provider, providerOrderId) — webhook idempotency", async () => {
    const interviewId = crypto.randomUUID();
    await createInterview(env.DB, { id: interviewId, cvText: "CV text" });

    await recordPayment(env.DB, {
      id: crypto.randomUUID(),
      interviewId,
      provider: "lemonsqueezy",
      providerOrderId: "order-456",
    });

    await expect(
      recordPayment(env.DB, {
        id: crypto.randomUUID(),
        interviewId,
        provider: "lemonsqueezy",
        providerOrderId: "order-456",
      }),
    ).rejects.toThrow(DuplicatePaymentError);
  });

  it("lists payments for an interview", async () => {
    const interviewId = crypto.randomUUID();
    await createInterview(env.DB, { id: interviewId, cvText: "CV text" });

    await recordPayment(env.DB, { id: crypto.randomUUID(), interviewId, provider: "lemonsqueezy", providerOrderId: "order-a" });
    await recordPayment(env.DB, { id: crypto.randomUUID(), interviewId, provider: "lemonsqueezy", providerOrderId: "order-b" });

    const payments = await listPaymentsForInterview(env.DB, interviewId);
    expect(payments).toHaveLength(2);
    expect(payments.map((payment) => payment.providerOrderId).sort()).toEqual(["order-a", "order-b"]);
  });
});
