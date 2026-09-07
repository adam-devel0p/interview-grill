/** Current time as an ISO-8601 string — the format every `*_at` column stores. */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * True if `error` is a D1/SQLite UNIQUE constraint violation. D1 throws on the
 * prepared-statement `.run()` call rather than returning `{ success: false }`, so
 * repository modules that rely on a UNIQUE index for idempotency (reports, payments)
 * catch and classify the thrown error instead of pre-checking with a SELECT.
 */
export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && /unique constraint failed/i.test(error.message);
}
