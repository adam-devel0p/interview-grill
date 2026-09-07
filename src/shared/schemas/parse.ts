import type { z } from "zod";

export class SchemaValidationError extends Error {
  readonly context: string;
  readonly issues: { path: string; message: string }[];

  constructor(context: string, issues: { path: string; message: string }[]) {
    const issueSummary = issues.map((issue) => `${issue.path || "(root)"}: ${issue.message}`).join("; ");
    super(`Schema validation failed for "${context}": ${issueSummary}`);
    this.name = "SchemaValidationError";
    this.context = context;
    this.issues = issues;
  }
}

/**
 * Parses `data` against `schema`, throwing a `SchemaValidationError` on failure.
 * The error message is built only from Zod issue paths/messages — the raw `data`
 * is never included, since it may contain CV/candidate-answer text (build-plan §36).
 */
export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown, context: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    throw new SchemaValidationError(context, issues);
  }
  return result.data;
}
