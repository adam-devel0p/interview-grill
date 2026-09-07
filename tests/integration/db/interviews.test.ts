import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createInterview, getInterview, InterviewNotFoundError, updateInterview } from "../../../src/worker/lib/db/interviews";
import { applyTestMigrations } from "../helpers/migrate";
import { sampleCvAnalysis, sampleInterviewState } from "../helpers/fixtures";

beforeAll(async () => {
  await applyTestMigrations(env.DB);
});

describe("interviews repository", () => {
  it("creates an interview and reads it back", async () => {
    const id = crypto.randomUUID();
    const created = await createInterview(env.DB, {
      id,
      cvText: "Senior Java engineer, 9 years, Spring/Kafka/Postgres",
      jobDescription: "Senior backend engineer",
      email: "candidate@example.com",
    });

    expect(created).toMatchObject({
      id,
      status: "created",
      paid: false,
      freeAnswersUsed: 0,
      analysis: null,
      interviewState: null,
    });

    const fetched = await getInterview(env.DB, id);
    expect(fetched).toEqual(created);
  });

  it("returns null for an unknown id", async () => {
    const fetched = await getInterview(env.DB, crypto.randomUUID());
    expect(fetched).toBeNull();
  });

  it("defaults jobDescription/email to null when omitted", async () => {
    const id = crypto.randomUUID();
    const created = await createInterview(env.DB, { id, cvText: "Junior Java developer, 2 years" });
    expect(created.jobDescription).toBeNull();
    expect(created.email).toBeNull();
  });

  it("partially updates status/paid/freeAnswersUsed and persists across reads", async () => {
    const id = crypto.randomUUID();
    await createInterview(env.DB, { id, cvText: "CV text" });

    const updated = await updateInterview(env.DB, id, { status: "in_progress", paid: true, freeAnswersUsed: 2 });
    expect(updated.status).toBe("in_progress");
    expect(updated.paid).toBe(true);
    expect(updated.freeAnswersUsed).toBe(2);
    expect(updated.updatedAt).not.toBe(updated.createdAt);

    const reloaded = await getInterview(env.DB, id);
    expect(reloaded).toEqual(updated);
  });

  it("round-trips analysis_json and interview_state_json through their Zod schemas", async () => {
    const id = crypto.randomUUID();
    await createInterview(env.DB, { id, cvText: "CV text" });

    await updateInterview(env.DB, id, {
      analysis: sampleCvAnalysis,
      interviewState: sampleInterviewState,
    });

    const reloaded = await getInterview(env.DB, id);
    expect(reloaded?.analysis).toEqual(sampleCvAnalysis);
    expect(reloaded?.interviewState).toEqual(sampleInterviewState);
  });

  it("leaves fields not present on the patch untouched", async () => {
    const id = crypto.randomUUID();
    await createInterview(env.DB, { id, cvText: "CV text" });
    await updateInterview(env.DB, id, { status: "analyzing" });
    const afterFirstUpdate = await updateInterview(env.DB, id, { paid: true });

    expect(afterFirstUpdate.status).toBe("analyzing");
    expect(afterFirstUpdate.paid).toBe(true);
  });

  it("throws InterviewNotFoundError when updating a nonexistent interview", async () => {
    await expect(updateInterview(env.DB, crypto.randomUUID(), { status: "failed" })).rejects.toThrow(
      InterviewNotFoundError,
    );
  });
});
