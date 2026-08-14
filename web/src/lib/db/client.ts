import "server-only";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";
import { runMigrations } from "./migrate";

const dataDir = process.env.KIKOERU_DATA_DIR
  ? path.resolve(process.env.KIKOERU_DATA_DIR)
  : path.resolve(process.cwd(), "..", "data");

const dbPath = path.join(dataDir, "kikoeru.db");

const globalForDb = globalThis as unknown as {
  __kikoeruSqlite?: Database.Database;
};

let connection: Database.Database | undefined;
let orm: BetterSQLite3Database<typeof schema> | undefined;

/**
 * Opens the database on first use — never at import time.
 *
 * `next build` collects page data in one worker process per core, and each of
 * them evaluates every route module. Connecting (and migrating) at module scope
 * meant a build against an unmigrated database had ~20 processes racing to
 * apply the same migrations, which fails with SQLITE_BUSY. Nothing here is
 * needed to *describe* a route, only to serve one, so the work waits until a
 * query actually runs.
 */
function connect(): Database.Database {
  const cached = globalForDb.__kikoeruSqlite ?? connection;
  if (cached) return cached;

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const conn = new Database(dbPath);
  conn.pragma("journal_mode = WAL");
  conn.pragma("foreign_keys = ON");
  conn.pragma("synchronous = NORMAL");
  // A scan script or a second server process may hold the write lock when we
  // open. Wait for it rather than failing the first query.
  conn.pragma("busy_timeout = 10000");
  // Bring an empty/fresh database up to the current schema on first
  // connection so queries don't fail with `no such table`.
  runMigrations(conn, drizzle(conn, { schema }));

  connection = conn;
  if (process.env.NODE_ENV !== "production") {
    globalForDb.__kikoeruSqlite = conn;
  }
  return conn;
}

function getSqlite(): Database.Database {
  return connect();
}

function getDb(): BetterSQLite3Database<typeof schema> {
  const conn = connect();
  // Rebuild if the dev-mode global handed back a connection this module
  // instance has not wrapped yet (HMR replaces the module, not the handle).
  if (!orm || connection !== conn) {
    connection = conn;
    orm = drizzle(conn, { schema });
  }
  return orm;
}

/**
 * Both exports are lazy proxies: a bare `import { db }` costs nothing, and the
 * connection opens on the first property access. Methods are bound to the real
 * object so `this` never sees the proxy.
 */
function lazy<T extends object>(resolve: () => T): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      const target = resolve();
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
    has: (_target, prop) => Reflect.has(resolve(), prop),
    ownKeys: () => Reflect.ownKeys(resolve()),
    getOwnPropertyDescriptor: (_target, prop) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(resolve(), prop);
      // Proxy invariants: a descriptor reported for a key missing from the
      // (empty) target has to be configurable.
      return descriptor && { ...descriptor, configurable: true };
    },
  });
}

export const db = lazy(getDb);
export const sqlite = lazy(getSqlite);
export const DATA_DIR = dataDir;
