import "server-only";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";
import { runMigrations } from "./migrate";

const dataDir = process.env.KIKOERU_DATA_DIR
  ? path.resolve(process.env.KIKOERU_DATA_DIR)
  : path.resolve(process.cwd(), "..", "data");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "kikoeru.db");

const globalForDb = globalThis as unknown as {
  __kikoeruSqlite?: Database.Database;
};

const sqlite =
  globalForDb.__kikoeruSqlite ??
  (() => {
    const conn = new Database(dbPath);
    conn.pragma("journal_mode = WAL");
    conn.pragma("foreign_keys = ON");
    conn.pragma("synchronous = NORMAL");
    // Bring an empty/fresh database up to the current schema on first
    // connection so queries don't fail with `no such table`.
    runMigrations(conn, drizzle(conn, { schema }));
    return conn;
  })();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__kikoeruSqlite = sqlite;
}

export const db = drizzle(sqlite, { schema });
export { sqlite };
export const DATA_DIR = dataDir;
