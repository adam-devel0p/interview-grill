import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import {
  AiRequestError,
  AiResponseValidationError,
  callStructured,
  STRUCTURED_OUTPUT_TOOL_NAME,
} from "../../../src/worker/lib/ai/client";

const testSchema = z.object({
  greeting: z.string(),
  count: z.number(),
});

function fakeAnthropic(create: (...args: unknown[]) => unknown): Anthropic {
  return { messages: { create: vi.fn(create) } } as unknown as Anthropic;
}

function toolUseMessage(input: unknown, usage = { input_tokens: 10, output_tokens: 5 }) {
  return {
    id: "msg_1",
    content: [{ type: "tool_use", id: "toolu_1", name: STRUCTURED_OUTPUT_TOOL_NAME, input }],
    usage,
  };
}

class FakeApiError extends Error {
  status: number;
  constructor(status: number, message = "boom") {
    super(message);
    this.name = "FakeApiError";
    this.status = status;
  }
}

const baseParams = {
  requestType: "analysis" as const,
  model: "test-model",
  system: "system prompt",
  messages: [{ role: "user" as const, content: "hello" }],
  schema: testSchema,
};

describe("callStructured", () => {
  it("resolves data and usage on a valid first response", async () => {
    const create = vi.fn().mockResolvedValue(toolUseMessage({ greeting: "hi", count: 1 }));
    const anthropic = fakeAnthropic(create);

    const result = await callStructured(anthropic, baseParams);

    expect(result.data).toEqual({ greeting: "hi", count: 1 });
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("retries once with corrective context after invalid JSON, then resolves", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(toolUseMessage({ greeting: "hi" })) // missing `count`
      .mockResolvedValueOnce(toolUseMessage({ greeting: "hi", count: 2 }, { input_tokens: 8, output_tokens: 4 }));
    const anthropic = fakeAnthropic(create);

    const result = await callStructured(anthropic, baseParams);

    expect(result.data).toEqual({ greeting: "hi", count: 2 });
    expect(result.usage).toEqual({ inputTokens: 18, outputTokens: 9 });
    expect(create).toHaveBeenCalledTimes(2);

    const retryCallBody = create.mock.calls[1]?.[0] as { messages: unknown[] };
    const retryMessages = retryCallBody.messages as { role: string; content: unknown }[];
    const lastMessage = retryMessages.at(-1);
    expect(lastMessage?.role).toBe("user");
    const toolResultBlock = (lastMessage?.content as { type: string; content: string }[])[0];
    expect(toolResultBlock?.type).toBe("tool_result");
    expect(toolResultBlock?.content).toContain("count");
  });

  it("unwraps a single-key wrapper (e.g. { parameters: {...} }) around the tool input", async () => {
    const create = vi.fn().mockResolvedValue(toolUseMessage({ parameters: { greeting: "hi", count: 3 } }));
    const anthropic = fakeAnthropic(create);

    const result = await callStructured(anthropic, baseParams);

    expect(result.data).toEqual({ greeting: "hi", count: 3 });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("does not unwrap a single-key object when the wrapper key happens to be a real schema field", async () => {
    // A single-key payload that already validates directly must be used as-is, not
    // unwrapped further.
    const singleFieldSchema = z.object({ onlyField: z.string() });
    const create = vi.fn().mockResolvedValue(toolUseMessage({ onlyField: "value" }));
    const anthropic = fakeAnthropic(create);

    const result = await callStructured(anthropic, { ...baseParams, schema: singleFieldSchema });

    expect(result.data).toEqual({ onlyField: "value" });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("throws AiResponseValidationError when both attempts produce invalid output", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(toolUseMessage({ greeting: "hi" }))
      .mockResolvedValueOnce(toolUseMessage({ greeting: "hi" }));
    const anthropic = fakeAnthropic(create);

    await expect(callStructured(anthropic, baseParams)).rejects.toThrow(AiResponseValidationError);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("throws AiResponseValidationError when the model never calls the tool", async () => {
    const noToolUseMessage = {
      id: "msg_1",
      content: [{ type: "text", text: "I don't want to use tools." }],
      usage: { input_tokens: 5, output_tokens: 5 },
    };
    const create = vi.fn().mockResolvedValue(noToolUseMessage);
    const anthropic = fakeAnthropic(create);

    await expect(callStructured(anthropic, baseParams)).rejects.toThrow(AiResponseValidationError);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("throws AiRequestError when retryable API errors exhaust all attempts", async () => {
    const create = vi.fn().mockRejectedValue(new FakeApiError(500));
    const anthropic = fakeAnthropic(create);

    await expect(callStructured(anthropic, baseParams)).rejects.toThrow(AiRequestError);
    // initial attempt + 2 retries for the first structured call
    expect(create).toHaveBeenCalledTimes(3);
  }, 10000);

  it("does not retry non-retryable API errors", async () => {
    const create = vi.fn().mockRejectedValue(new FakeApiError(400, "bad request"));
    const anthropic = fakeAnthropic(create);

    await expect(callStructured(anthropic, baseParams)).rejects.toThrow(AiRequestError);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
