import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createInterview } from "../../../src/worker/lib/db/interviews";
import { DuplicateReportError, getReport, saveReport } from "../../../src/worker/lib/db/reports";
import { applyTestMigrations } from "../helpers/migrate";
import { sampleReport } from "../helpers/fixtures";

beforeAll(async () => {
  await applyTestMigrations(env.DB);
});

describe("reports repository", () => {
  it("saves a report and reads the same Report back", async () => {
    const interviewId = crypto.randomUUID();
    await createInterview(env.DB, { id: interviewId, cvText: "CV text" });

    await saveReport(env.DB, { id: crypto.randomUUID(), interviewId, report: sampleReport });

    const reloaded = await getReport(env.DB, interviewId);
    expect(reloaded).toEqual(sampleReport);
  });

  it("returns null when no report exists for the interview", async () => {
    const reloaded = await getReport(env.DB, crypto.randomUUID());
    expect(reloaded).toBeNull();
  });

  it("throws DuplicateReportError when saving a second report for the same interview", async () => {
    const interviewId = crypto.randomUUID();
    await createInterview(env.DB, { id: interviewId, cvText: "CV text" });
    await saveReport(env.DB, { id: crypto.randomUUID(), interviewId, report: sampleReport });

    await expect(saveReport(env.DB, { id: crypto.randomUUID(), interviewId, report: sampleReport })).rejects.toThrow(
      DuplicateReportError,
    );
  });
});
