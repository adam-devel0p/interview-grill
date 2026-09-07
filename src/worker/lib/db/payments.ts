import { isUniqueConstraintError, nowIso } from "./shared";

/**
 * Thrown when a payment for the same `(provider, providerOrderId)` already exists
 * (`idx_payments_provider_order` is UNIQUE) — this is the mechanism Phase 12's webhook
 * handler relies on for idempotency when a provider retries a delivery.
 */
export class DuplicatePaymentError extends Error {
  readonly provider: string;
  readonly providerOrderId: string;

  constructor(provider: string, providerOrderId: string) {
    super(`A payment for provider "${provider}" order "${providerOrderId}" already exists`);
    this.name = "DuplicatePaymentError";
    this.provider = provider;
    this.providerOrderId = providerOrderId;
  }
}

export interface Payment {
  id: string;
  interviewId: string | null;
  provider: string;
  providerOrderId: string | null;
  amount: number | null;
  currency: string | null;
  status: string | null;
  createdAt: string;
}

interface PaymentRow {
  id: string;
  interview_id: string | null;
  provider: string;
  provider_order_id: string | null;
  amount: number | null;
  currency: string | null;
  status: string | null;
  created_at: string;
}

function mapPaymentRow(row: PaymentRow): Payment {
  return {
    id: row.id,
    interviewId: row.interview_id,
    provider: row.provider,
    providerOrderId: row.provider_order_id,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    createdAt: row.created_at,
  };
}

export interface RecordPaymentParams {
  id: string;
  interviewId?: string;
  provider: string;
  providerOrderId?: string;
  amount?: number;
  currency?: string;
  status?: string;
}

export async function recordPayment(db: D1Database, params: RecordPaymentParams): Promise<Payment> {
  const now = nowIso();
  try {
    await db
      .prepare(
        `INSERT INTO payments (id, interview_id, provider, provider_order_id, amount, currency, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        params.id,
        params.interviewId ?? null,
        params.provider,
        params.providerOrderId ?? null,
        params.amount ?? null,
        params.currency ?? null,
        params.status ?? null,
        now,
      )
      .run();
  } catch (error) {
    if (isUniqueConstraintError(error) && params.providerOrderId !== undefined) {
      throw new DuplicatePaymentError(params.provider, params.providerOrderId);
    }
    throw error;
  }

  return {
    id: params.id,
    interviewId: params.interviewId ?? null,
    provider: params.provider,
    providerOrderId: params.providerOrderId ?? null,
    amount: params.amount ?? null,
    currency: params.currency ?? null,
    status: params.status ?? null,
    createdAt: now,
  };
}

export async function getPaymentByProviderOrderId(
  db: D1Database,
  provider: string,
  providerOrderId: string,
): Promise<Payment | null> {
  const row = await db
    .prepare(`SELECT * FROM payments WHERE provider = ? AND provider_order_id = ?`)
    .bind(provider, providerOrderId)
    .first<PaymentRow>();
  return row ? mapPaymentRow(row) : null;
}

export async function listPaymentsForInterview(db: D1Database, interviewId: string): Promise<Payment[]> {
  const { results } = await db
    .prepare(`SELECT * FROM payments WHERE interview_id = ? ORDER BY created_at ASC, rowid ASC`)
    .bind(interviewId)
    .all<PaymentRow>();
  return results.map(mapPaymentRow);
}
