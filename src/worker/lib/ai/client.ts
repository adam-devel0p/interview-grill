import type Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  MessageCreateParamsNonStreaming,
  MessageParam,
  Tool,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";
import { z } from "zod";

export type AiRequestType = "analysis" | "interviewer" | "evaluator" | "report";

export interface StructuredAiCallParams<T> {
  requestType: AiRequestType;
  model: string; // resolved from config by caller, not hard-coded here
  system: string;
  messages: MessageParam[];
  schema: z.ZodType<T>;
  maxTokens?: number;
  interviewId?: string; // for usage logging only, never logged content
}

export interface StructuredAiCallResult<T> {
  data: T;
  usage: { inputTokens: number; outputTokens: number };
}

/**
 * Thrown when the model's structured output fails schema validation on both the
 * initial attempt and the single corrective retry. Never includes the raw model
 * output or prompt content (build-plan §36) — only Zod issue paths/messages.
 */
export class AiResponseValidationError extends Error {
  readonly requestType: AiRequestType;
  readonly issues: { path: string; message: string }[];

  constructor(requestType: AiRequestType, issues: { path: string; message: string }[]) {
    const issueSummary = issues.map((issue) => `${issue.path || "(root)"}: ${issue.message}`).join("; ");
    super(`AI response validation failed for "${requestType}" (after retry): ${issueSummary}`);
    this.name = "AiResponseValidationError";
    this.requestType = requestType;
    this.issues = issues;
  }
}

/**
 * Thrown when the Anthropic API call itself fails (network error, timeout, 5xx,
 * rate limit) after retries are exhausted. Wraps the underlying SDK error as `cause`
 * — SDK errors carry status/type/request-id, never request content.
 */
export class AiRequestError extends Error {
  readonly requestType: AiRequestType;

  constructor(requestType: AiRequestType, cause: unknown) {
    const causeMessage = cause instanceof Error ? cause.message : String(cause);
    super(`AI request failed for "${requestType}": ${causeMessage}`, { cause });
    this.name = "AiRequestError";
    this.requestType = requestType;
  }
}

/** Name of the forced tool call used to extract structured output. Exported for tests. */
export const STRUCTURED_OUTPUT_TOOL_NAME = "emit_structured_output";
const TOOL_NAME = STRUCTURED_OUTPUT_TOOL_NAME;
const DEFAULT_MAX_TOKENS = 4096;
const MAX_NETWORK_ATTEMPTS = 3; // initial attempt + 2 retries
const RETRY_BASE_DELAY_MS = 250;
const RETRYABLE_STATUS_CODES = new Set([408, 409, 429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableApiError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const status = (error as { status?: unknown }).status;
  if (typeof status === "number") {
    return RETRYABLE_STATUS_CODES.has(status);
  }
  // Connection/timeout errors from the SDK have no HTTP status but are transient.
  const name = error.name;
  return name === "APIConnectionError" || name === "APIConnectionTimeoutError";
}

function buildTool<T>(schema: z.ZodType<T>): Tool {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  delete jsonSchema.$schema;
  return {
    name: TOOL_NAME,
    description:
      "Emit the result of this request as structured data matching the required JSON schema. " +
      "Always call this tool exactly once with the complete result.",
    input_schema: jsonSchema as Tool.InputSchema,
  };
}

function findToolUseBlock(message: Message): ToolUseBlock | undefined {
  return message.content.find(
    (block): block is ToolUseBlock => block.type === "tool_use" && block.name === TOOL_NAME
  );
}

function formatIssues(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}

async function createMessageWithRetry(
  anthropic: Anthropic,
  body: MessageCreateParamsNonStreaming,
  requestType: AiRequestType
): Promise<Message> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_NETWORK_ATTEMPTS; attempt++) {
    try {
      return await anthropic.messages.create(body);
    } catch (error) {
      lastError = error;
      if (!isRetryableApiError(error) || attempt === MAX_NETWORK_ATTEMPTS) {
        throw new AiRequestError(requestType, error);
      }
      await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }
  // Unreachable, but keeps TS happy.
  throw new AiRequestError(requestType, lastError);
}

export async function callStructured<T>(
  anthropic: Anthropic,
  params: StructuredAiCallParams<T>
): Promise<StructuredAiCallResult<T>> {
  const { requestType, model, system, schema, interviewId } = params;
  const tool = buildTool(schema);
  const baseBody: MessageCreateParamsNonStreaming = {
    model,
    max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
    system,
    messages: params.messages,
    tools: [tool],
    tool_choice: { type: "tool", name: TOOL_NAME },
  };

  const firstResponse = await createMessageWithRetry(anthropic, baseBody, requestType);
  const firstToolUse = findToolUseBlock(firstResponse);
  const firstParsed = firstToolUse ? schema.safeParse(firstToolUse.input) : undefined;

  if (firstToolUse && firstParsed?.success) {
    return {
      data: firstParsed.data,
      usage: {
        inputTokens: firstResponse.usage.input_tokens,
        outputTokens: firstResponse.usage.output_tokens,
      },
    };
  }

  const firstIssues = firstParsed && !firstParsed.success
    ? formatIssues(firstParsed.error)
    : [{ path: "", message: "Model did not call the required tool." }];

  logAiEvent("structured_output_validation_failed", { requestType, model, interviewId, issues: firstIssues });

  const correctiveText =
    "Your previous response did not match the required schema. Issues:\n" +
    firstIssues.map((issue) => `- ${issue.path || "(root)"}: ${issue.message}`).join("\n") +
    "\nCall the tool again with a corrected, complete input that satisfies every field.";

  const retryMessages: MessageParam[] = [
    ...params.messages,
    { role: "assistant", content: firstResponse.content },
    {
      role: "user",
      content: firstToolUse
        ? [{ type: "tool_result", tool_use_id: firstToolUse.id, content: correctiveText, is_error: true }]
        : correctiveText,
    },
  ];

  const retryResponse = await createMessageWithRetry(
    anthropic,
    { ...baseBody, messages: retryMessages },
    requestType
  );
  const retryToolUse = findToolUseBlock(retryResponse);
  const retryParsed = retryToolUse ? schema.safeParse(retryToolUse.input) : undefined;

  if (retryToolUse && retryParsed?.success) {
    return {
      data: retryParsed.data,
      usage: {
        inputTokens: firstResponse.usage.input_tokens + retryResponse.usage.input_tokens,
        outputTokens: firstResponse.usage.output_tokens + retryResponse.usage.output_tokens,
      },
    };
  }

  const retryIssues = retryParsed && !retryParsed.success
    ? formatIssues(retryParsed.error)
    : [{ path: "", message: "Model did not call the required tool." }];

  throw new AiResponseValidationError(requestType, retryIssues);
}

function logAiEvent(event: string, details: Record<string, unknown>): void {
  // Never log message/schema content — only request metadata.
  console.warn(event, details);
}
