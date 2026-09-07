import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { analyzeCv } from "../../../src/worker/lib/ai/analyzer";
import { STRUCTURED_OUTPUT_TOOL_NAME } from "../../../src/worker/lib/ai/client";
import type { CvAnalysis } from "../../../src/shared/schemas/analysis";
// Loaded as a raw string at build time (Vite `?raw`) rather than read from disk at
// runtime — the `unit` test project runs in the workerd runtime, which has no filesystem.
import seniorJavaCv from "../../fixtures/cvs/senior-java-cv.txt?raw";
import seniorBackendJd from "../../fixtures/jobDescriptions/senior-backend-jd.txt?raw";

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

const validClaim = {
  id: "claim-1",
  text: "Designed the event backbone on Apache Kafka.",
  sourceExcerpt: "Designed the event backbone on Apache Kafka: 3 clusters (6 brokers each)",
  category: "MESSAGING" as const,
  riskLevel: "high" as const,
  confidence: 0.6,
  reasoning: "Detailed but worth probing for personal contribution vs. team effort.",
  likelyQuestions: ["What happens if a broker fails mid-transaction?"],
  requiredDepth: "senior" as const,
};

const validAnalysis: CvAnalysis = {
  estimatedSeniority: "senior",
  yearsExperienceEstimate: 10,
  primaryStack: ["Java", "Spring Boot", "Kafka"],
  technologies: ["Java", "Spring Boot", "Kafka", "PostgreSQL"],
  projects: [{ name: "Order processing migration", description: "Monolith to microservices." }],
  claims: [validClaim],
  vagueClaims: ["Improved system performance and reliability across the platform."],
};

describe("analyzeCv", () => {
  it("returns the parsed CvAnalysis and prompts with the CV text (no JD)", async () => {
    const create = vi.fn().mockResolvedValue(toolUseMessage(validAnalysis));
    const anthropic = fakeAnthropic(create);

    const result = await analyzeCv(anthropic, { cvText: "Experienced Java engineer." }, "test-model");

    expect(result.data).toEqual(validAnalysis);
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });

    const body = create.mock.calls[0]?.[0] as { system: string; messages: { content: string }[] };
    expect(body.messages[0]?.content).toContain("Experienced Java engineer.");
    expect(body.messages[0]?.content).not.toContain("<job_description>");
    expect(body.system).toContain("No job description was provided");
    expect(body.system).not.toContain("Additionally populate");
  });

  it("includes the job description in the prompt and jobMatch instructions when provided", async () => {
    const withJobMatch: CvAnalysis = {
      ...validAnalysis,
      jobMatch: {
        roleMatchScore: 85,
        requiredTechnologies: ["Java", "Kafka"],
        strongMatches: ["Kafka"],
        partialMatches: [],
        gaps: [],
        skillsMaybeNotDeepEnough: [],
        interviewPriorities: ["Kafka exactly-once semantics"],
      },
    };
    const create = vi.fn().mockResolvedValue(toolUseMessage(withJobMatch));
    const anthropic = fakeAnthropic(create);

    const result = await analyzeCv(
      anthropic,
      { cvText: "Experienced Java engineer.", jobDescription: "Looking for a Java engineer." },
      "test-model",
    );

    expect(result.data.jobMatch).toEqual(withJobMatch.jobMatch);

    const body = create.mock.calls[0]?.[0] as { system: string; messages: { content: string }[] };
    expect(body.messages[0]?.content).toContain("<job_description>");
    expect(body.messages[0]?.content).toContain("Looking for a Java engineer.");
    expect(body.system).toContain("jobMatch");
  });

  it("builds a prompt that carries the full fixture CV content through, unmodified", async () => {
    const cvText = seniorJavaCv;
    const jobDescription = seniorBackendJd;
    const create = vi.fn().mockResolvedValue(toolUseMessage(validAnalysis));
    const anthropic = fakeAnthropic(create);

    await analyzeCv(anthropic, { cvText, jobDescription }, "test-model");

    const body = create.mock.calls[0]?.[0] as { messages: { content: string }[] };
    const promptContent = body.messages[0]?.content ?? "";
    expect(promptContent).toContain("Kafka");
    expect(promptContent).toContain("Prometheus");
    expect(promptContent).toContain(cvText);
    expect(promptContent).toContain(jobDescription);
  });

  it("propagates schema validation failure when the mocked response is missing required claim fields", async () => {
    const invalidAnalysis = {
      ...validAnalysis,
      claims: [{ ...validClaim, reasoning: undefined }],
    };
    const create = vi.fn().mockResolvedValue(toolUseMessage(invalidAnalysis));
    const anthropic = fakeAnthropic(create);

    await expect(
      analyzeCv(anthropic, { cvText: "Experienced Java engineer." }, "test-model"),
    ).rejects.toThrow(/validation failed/i);
    expect(create).toHaveBeenCalledTimes(2); // first attempt + one corrective retry
  });
});
