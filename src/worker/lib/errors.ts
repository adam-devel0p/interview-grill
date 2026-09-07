import type { Context, Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { z, ZodError } from "zod";
import { AiRequestError, AiResponseValidationError } from "./ai/client";
import { InterviewNotFoundError } from "./db/interviews";
import type { AppEnv } from "./honoEnv";
import { SchemaValidationError } from "../../shared/schemas/parse";

/**
 * Central error handling (build-plan §37): every route throws a typed error and this
 * module maps it to the `{ error: { code, message } }` contract (Section 4.8) with the
 * right HTTP status. Messages are always static/user-safe — never the raw error, which
 * could otherwise leak CV/candidate-answer content or upstream error bodies
 * (build-plan §36).
 */

export class ApiError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;

  constructor(status: ContentfulStatusCode, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export class ValidationError extends ApiError {
  readonly fields: { path: string; message: string }[];

  constructor(zodError: ZodError) {
    super(400, "VALIDATION_ERROR", "Request body failed validation");
    this.name = "ValidationError";
    this.fields = zodError.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
  }
}

interface ErrorResponseBody {
  error: { code: string; message: string; fields?: ValidationError["fields"] };
}

function errorBody(code: string, message: string, fields?: ValidationError["fields"]): ErrorResponseBody {
  return fields ? { error: { code, message, fields } } : { error: { code, message } };
}

/** Parses and Zod-validates a JSON request body, throwing `ApiError`/`ValidationError` on failure. */
export async function parseJsonBody<T>(c: Context, schema: z.ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await c.req.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON");
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new ValidationError(result.error);
  }
  return result.data;
}

export function registerErrorHandler(app: Hono<AppEnv>): void {
  app.onError((error, c) => {
    if (error instanceof ValidationError) {
      return c.json(errorBody(error.code, error.message, error.fields), error.status);
    }
    if (error instanceof ApiError) {
      return c.json(errorBody(error.code, error.message), error.status);
    }
    if (error instanceof InterviewNotFoundError) {
      return c.json(errorBody("NOT_FOUND", "Interview not found"), 404);
    }
    if (error instanceof AiResponseValidationError) {
      console.error("ai_response_validation_failed", { requestType: error.requestType });
      return c.json(
        errorBody("AI_INVALID_RESPONSE", "The AI service returned an unexpected response. Please try again."),
        502,
      );
    }
    if (error instanceof AiRequestError) {
      const causeName = error.cause instanceof Error ? error.cause.name : undefined;
      console.error("ai_request_failed", { requestType: error.requestType, causeName });
      return c.json(
        errorBody("AI_UPSTREAM_ERROR", "The AI service is temporarily unavailable. Please try again shortly."),
        502,
      );
    }
    if (error instanceof SchemaValidationError) {
      console.error("stored_schema_validation_failed", { context: error.context });
      return c.json(errorBody("INTERNAL_ERROR", "Stored interview data is invalid."), 500);
    }
    console.error("unhandled_route_error", { name: error.name, message: error.message });
    return c.json(errorBody("INTERNAL_ERROR", "An unexpected error occurred."), 500);
  });
}
