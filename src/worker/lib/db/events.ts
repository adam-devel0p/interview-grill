import { nowIso } from "./shared";

export interface AnalyticsEvent {
  id: string;
  interviewId: string | null;
  eventName: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface EventRow {
  id: string;
  interview_id: string | null;
  event_name: string;
  metadata_json: string | null;
  created_at: string;
}

function mapEventRow(row: EventRow): AnalyticsEvent {
  return {
    id: row.id,
    interviewId: row.interview_id,
    eventName: row.event_name,
    metadata: row.metadata_json ? (JSON.parse(row.metadata_json) as Record<string, unknown>) : null,
    createdAt: row.created_at,
  };
}

export async function logEvent(
  db: D1Database,
  interviewId: string | null,
  eventName: string,
  metadata?: Record<string, unknown>,
): Promise<AnalyticsEvent> {
  const id = crypto.randomUUID();
  const now = nowIso();
  await db
    .prepare(`INSERT INTO events (id, interview_id, event_name, metadata_json, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(id, interviewId, eventName, metadata ? JSON.stringify(metadata) : null, now)
    .run();

  return {
    id,
    interviewId,
    eventName,
    metadata: metadata ?? null,
    createdAt: now,
  };
}

export async function listEventsForInterview(db: D1Database, interviewId: string): Promise<AnalyticsEvent[]> {
  const { results } = await db
    .prepare(`SELECT * FROM events WHERE interview_id = ? ORDER BY created_at ASC, rowid ASC`)
    .bind(interviewId)
    .all<EventRow>();
  return results.map(mapEventRow);
}
