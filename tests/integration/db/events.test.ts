import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createInterview } from "../../../src/worker/lib/db/interviews";
import { listEventsForInterview, logEvent } from "../../../src/worker/lib/db/events";
import { applyTestMigrations } from "../helpers/migrate";

beforeAll(async () => {
  await applyTestMigrations(env.DB);
});

describe("events repository", () => {
  it("logs an event with an interviewId and metadata", async () => {
    const interviewId = crypto.randomUUID();
    await createInterview(env.DB, { id: interviewId, cvText: "CV text" });

    const event = await logEvent(env.DB, interviewId, "interview_started", { source: "web" });
    expect(event.interviewId).toBe(interviewId);
    expect(event.eventName).toBe("interview_started");
    expect(event.metadata).toEqual({ source: "web" });

    const events = await listEventsForInterview(env.DB, interviewId);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(event);
  });

  it("logs an event with no interviewId and no metadata", async () => {
    const event = await logEvent(env.DB, null, "landing_page_viewed");
    expect(event.interviewId).toBeNull();
    expect(event.metadata).toBeNull();
  });
});
