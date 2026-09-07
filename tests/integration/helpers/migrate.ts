import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import migrationSql from "../../../migrations/0001_init.sql?raw";

function splitStatements(sql: string): string[] {
  return sql
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

const MIGRATIONS: D1Migration[] = [{ name: "0001_init", queries: splitStatements(migrationSql) }];

/** Applies `migrations/0001_init.sql` to the isolated per-test-file D1 instance. Call from `beforeAll`. */
export async function applyTestMigrations(db: D1Database): Promise<void> {
  await applyD1Migrations(db, MIGRATIONS);
}
