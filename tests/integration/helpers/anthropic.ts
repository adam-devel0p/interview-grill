import { vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { STRUCTURED_OUTPUT_TOOL_NAME } from "../../../src/worker/lib/ai/client";

let toolUseCounter = 0;

export function toolUseMessage(input: unknown, usage = { input_tokens: 10, output_tokens: 10 }) {
  toolUseCounter += 1;
  return {
    id: `msg_${toolUseCounter}`,
    content: [{ type: "tool_use", id: `toolu_${toolUseCounter}`, name: STRUCTURED_OUTPUT_TOOL_NAME, input }],
    usage,
  };
}

/**
 * A fake `Anthropic` client whose `messages.create` resolves each entry of `responses`
 * in order, one per call — used to script an entire interview flow (analysis,
 * interviewer, evaluator, report calls, in the exact order the routes make them)
 * without ever hitting the real API (build-plan §47: `npm test` makes zero real
 * Anthropic calls). Injected into `createApp({ anthropicFactory })`.
 */
export function scriptedAnthropic(responses: unknown[]): { anthropic: Anthropic; create: ReturnType<typeof vi.fn> } {
  const create = vi.fn();
  for (const response of responses) {
    create.mockResolvedValueOnce(toolUseMessage(response));
  }
  return { anthropic: { messages: { create } } as unknown as Anthropic, create };
}

/** A minimal, non-retryable (4xx-status) fake SDK error — `callStructured` fails
 * immediately on this without burning through its network-retry backoff. */
export class FakeApiError extends Error {
  status: number;
  constructor(status: number, message = "boom") {
    super(message);
    this.name = "FakeApiError";
    this.status = status;
  }
}
