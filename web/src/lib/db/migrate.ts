import "server-only";
import path from "node:path";
import fs from "node:fs";
import type Database from "better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");

/**
 * Applies the Drizzle migrations in `web/drizzle/` to the open database.
 *
 * The connection in client.ts auto-creates an empty SQLite file when none
 * exists, so without this step a fresh checkout (or a wrong KIKOERU_DATA_DIR)
 * yields an empty database and every query fails with
 * `no such table: ...`. Running the migrator on first connection makes the
 * database self-provision instead.
 *
 * Databases created before migrations existed already have the full schema but
 * no migration bookkeeping. We baseline those: seed `__drizzle_migrations` with
 * the latest known migration timestamp so the migrator treats the existing
 * schema as up to date and only applies genuinely new migrations later.
 */
export function runMigrations(
  sqlite: Database.Database,
  db: BetterSQLite3Database<typeof schema>,
): void {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    // No generated migrations to apply (e.g. a build that dropped the folder).
    return;
  }

  baselineLegacyDatabase(sqlite);
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}

function baselineLegacyDatabase(sqlite: Database.Database): void {
  const hasSchema = sqlite
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'works'",
    )
    .get();
  if (!hasSchema) {
    // Fresh/empty database — let the migrator create everything from scratch.
    return;
  }

  // Mirror the migrator's own bookkeeping table so its CREATE IF NOT EXISTS
  // is a no-op and our seed row is the one it reads.
  sqlite.exec(
    'CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)',
  );

  const alreadyTracked = sqlite
    .prepare('SELECT 1 FROM "__drizzle_migrations" LIMIT 1')
    .get();
  if (alreadyTracked) {
    return;
  }

  const journalPath = path.join(MIGRATIONS_DIR, "meta", "_journal.json");
  if (!fs.existsSync(journalPath)) {
    return;
  }
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as {
    entries?: { when: number }[];
  };
  // Baseline at 0000 — the snapshot migration that describes the schema these
  // legacy databases already have. Baselining at the *latest* entry instead
  // would silently mark every later migration as applied, so a legacy database
  // opened for the first time after a new migration landed would never get it.
  const baselineWhen = (journal.entries ?? [])[0]?.when;
  if (baselineWhen === undefined) {
    return;
  }

  // created_at == a migration's timestamp counts as "already applied", so the
  // migrator skips 0000 and runs every migration added after it.
  sqlite
    .prepare(
      'INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES (?, ?)',
    )
    .run("baseline", baselineWhen);
}
