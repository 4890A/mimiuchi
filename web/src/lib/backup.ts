import "server-only";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { sqlite } from "./db/client";
import { resolveLibraryRoots, resolveCoversDir } from "./config";
import { getSettings } from "./settings";
import { extractWorkId } from "./metadata/types";
import { invalidateSearchIndex } from "./search/index-builder";
import { invalidateFilterListCache } from "./db/queries";

/**
 * JSON backup + restore for the library database and its cover images.
 *
 * The format is deliberately schema-loose: rows are dumped straight out of
 * SQLite under their real column names, and on import every row is filtered
 * against the columns the database actually has right now. Columns dropped by
 * a later migration are ignored; columns added by one fall back to their
 * database default. See docs/backup-restore-plan.md.
 */

/** Bump when the on-disk shape changes incompatibly. */
export const BACKUP_VERSION = 1;

/**
 * Import order. Parents before children so foreign keys resolve, and it
 * doubles as the export order so a backup reads top-down.
 *
 * `track_waveforms` is deliberately absent: the caches are regenerable from
 * the audio with ffmpeg, and they dominate the size of a backup. Older
 * backups that carry the table are accepted, but the rows are ignored.
 */
export const BACKUP_TABLES = [
  "circles",
  "voice_actors",
  "tags",
  "works",
  "work_voice_actors",
  "work_tags",
  "tracks",
  "likes",
  "track_progress",
  "settings",
] as const;

export type BackupTableName = (typeof BACKUP_TABLES)[number];

export type BackupRow = Record<string, unknown>;

export type BackupTables = Record<BackupTableName, BackupRow[]>;

export interface BackupData {
  version: number;
  schemaVersion: number;
  createdAt: string;
  appVersion: string;
  data: BackupTables;
  /** Cover filename -> base64-encoded image bytes. */
  covers: Record<string, string>;
}

export interface RestoreSummary {
  imported: Record<string, number>;
  remapped: number;
  notFound: string[];
  warnings: string[];
  errors: string[];
}

export interface RestoreOptions {
  /** Run the whole import, then roll back instead of committing. */
  dryRun?: boolean;
}

/** Thrown for backups we refuse before touching the database. */
export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupValidationError";
  }
}

/** Internal signal that unwinds the import transaction on a dry run. */
class DryRunRollback extends Error {
  constructor() {
    super("dry run");
    this.name = "DryRunRollback";
  }
}

// ---------------------------------------------------------------------------
// Schema introspection
// ---------------------------------------------------------------------------

interface ColumnInfo {
  name: string;
  /** Declared SQLite type, upper-cased ("TEXT", "INTEGER", "BLOB", ...). */
  type: string;
}

/**
 * Columns the live database has for `table`, or null when the table is gone.
 *
 * This reads `PRAGMA table_info` rather than the Drizzle schema because the
 * import writes raw SQL: what matters is what the database will actually
 * accept, which after a migration is the authoritative answer.
 */
function getTableColumnInfo(table: string): ColumnInfo[] | null {
  const rows = sqlite.pragma(`table_info("${table}")`) as Array<{
    name: string;
    type: string;
  }>;
  if (rows.length === 0) return null;
  return rows.map((r) => ({ name: r.name, type: (r.type ?? "").toUpperCase() }));
}

/** Column names currently valid for `table`. Empty set if the table is gone. */
export function getValidColumns(table: string): Set<string> {
  return new Set((getTableColumnInfo(table) ?? []).map((c) => c.name));
}

/** Drops keys the current schema no longer has. */
export function filterRow(row: BackupRow, valid: Set<string>): BackupRow {
  const filtered: BackupRow = {};
  for (const [key, value] of Object.entries(row)) {
    if (valid.has(key)) filtered[key] = value;
  }
  return filtered;
}

/** Number of migrations applied when the backup was taken. */
function currentSchemaVersion(): number {
  try {
    const row = sqlite
      .prepare('SELECT COUNT(*) AS n FROM "__drizzle_migrations"')
      .get() as { n: number } | undefined;
    return row?.n ?? 0;
  } catch {
    // Bookkeeping table missing (database predates the migrator).
    return 0;
  }
}

function appVersion(): string {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
    ) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function encodeValue(value: unknown): unknown {
  // better-sqlite3 hands blobs back as Buffers; JSON can't hold them.
  if (Buffer.isBuffer(value)) return value.toString("base64");
  if (value instanceof Uint8Array) return Buffer.from(value).toString("base64");
  return value;
}

/** Every row of `table` under its real column names, blobs base64-encoded. */
export function dumpTable(table: BackupTableName): BackupRow[] {
  if (getTableColumnInfo(table) === null) return [];
  const rows = sqlite.prepare(`SELECT * FROM "${table}"`).all() as BackupRow[];
  return rows.map((row) => {
    const out: BackupRow = {};
    for (const [key, value] of Object.entries(row)) {
      out[key] = encodeValue(value);
    }
    return out;
  });
}

interface CoverEntry {
  /** Basename as stored in the backup, e.g. "RJ01000380.jpg". */
  name: string;
  filePath: string;
}

/**
 * Cover files referenced by works rows that still exist on disk.
 *
 * Keyed by basename: the restore side rebuilds the absolute path from the
 * target machine's covers directory, so the original directory is irrelevant.
 */
function collectCoverEntries(): CoverEntry[] {
  if (getTableColumnInfo("works") === null) return [];
  const rows = sqlite
    .prepare(
      `SELECT cover_path FROM "works" WHERE cover_path IS NOT NULL AND cover_path <> ''`,
    )
    .all() as Array<{ cover_path: string }>;

  const seen = new Set<string>();
  const entries: CoverEntry[] = [];
  for (const row of rows) {
    const name = path.basename(row.cover_path);
    if (seen.has(name)) continue;
    seen.add(name);
    if (!fs.existsSync(row.cover_path)) continue;
    entries.push({ name, filePath: row.cover_path });
  }
  return entries;
}

function backupHeader() {
  return {
    version: BACKUP_VERSION,
    schemaVersion: currentSchemaVersion(),
    createdAt: new Date().toISOString(),
    appVersion: appVersion(),
  };
}

/**
 * Builds a complete backup in memory.
 *
 * Fine for the CLI and for tests; the HTTP route uses {@link streamBackup}
 * instead so a library's worth of base64 covers never lands in one string.
 */
export async function createBackup(): Promise<BackupData> {
  const header = backupHeader();
  const data = {} as BackupTables;
  for (const table of BACKUP_TABLES) data[table] = dumpTable(table);

  const covers: Record<string, string> = {};
  for (const entry of collectCoverEntries()) {
    try {
      covers[entry.name] = (await fsp.readFile(entry.filePath)).toString(
        "base64",
      );
    } catch {
      // A cover that vanished between listing and reading isn't worth failing
      // the whole export over — the work still restores, just without art.
    }
  }

  return {
    version: header.version,
    schemaVersion: header.schemaVersion,
    createdAt: header.createdAt,
    appVersion: header.appVersion,
    data,
    covers,
  };
}

/**
 * Emits the same JSON as {@link createBackup}, one table (and one cover) at a
 * time, so the response body can be streamed without buffering the library.
 */
export async function* streamBackup(): AsyncGenerator<string> {
  const header = backupHeader();

  yield `{"version":${JSON.stringify(header.version)},`;
  yield `"schemaVersion":${JSON.stringify(header.schemaVersion)},`;
  yield `"createdAt":${JSON.stringify(header.createdAt)},`;
  yield `"appVersion":${JSON.stringify(header.appVersion)},`;
  yield `"data":{`;

  let first = true;
  for (const table of BACKUP_TABLES) {
    const rows = dumpTable(table);
    yield `${first ? "" : ","}${JSON.stringify(table)}:${JSON.stringify(rows)}`;
    first = false;
  }

  yield `},"covers":{`;
  first = true;
  for (const entry of collectCoverEntries()) {
    let base64: string;
    try {
      base64 = (await fsp.readFile(entry.filePath)).toString("base64");
    } catch {
      continue;
    }
    yield `${first ? "" : ","}${JSON.stringify(entry.name)}:${JSON.stringify(base64)}`;
    first = false;
  }
  yield `}}`;
}

// ---------------------------------------------------------------------------
// Path remapping
// ---------------------------------------------------------------------------

/** Mirrors the scanner's folder discovery depth. */
const RJ_SCAN_DEPTH = 4;

interface RjScanResult {
  map: Map<string, string>;
  /** Work id -> every directory that claimed it, when more than one did. */
  duplicates: Map<string, string[]>;
}

function scanRjPaths(libraryRoots: string[]): RjScanResult {
  const map = new Map<string, string>();
  const duplicates = new Map<string, string[]>();

  function record(id: string, full: string): void {
    const existing = map.get(id);
    if (existing === undefined) {
      map.set(id, full);
      return;
    }
    if (existing === full) return;
    // First match wins, matching the scanner. Remember the rest so restore can
    // tell the user which library root it picked.
    const seen = duplicates.get(id) ?? [existing];
    seen.push(full);
    duplicates.set(id, seen);
  }

  function walk(dir: string, depth: number): void {
    if (depth > RJ_SCAN_DEPTH) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      const id = extractWorkId(entry.name);
      if (id) record(id, full);
      else walk(full, depth + 1);
    }
  }

  for (const root of libraryRoots) walk(root, 0);
  return { map, duplicates };
}

/**
 * Maps every work id found under `libraryRoots` to its absolute directory.
 *
 * Restoring onto a different machine (or after reorganising the library) only
 * needs the RJ code to line up — the stored absolute path is rebuilt from
 * whatever the folder lives at now.
 */
export function buildRjPathMap(libraryRoots: string[]): Map<string, string> {
  return scanRjPaths(libraryRoots).map;
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/** Rejects a payload that isn't a backup before anything is written. */
export function validateBackup(input: unknown): asserts input is BackupData {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new BackupValidationError(
      "Invalid backup file: expected a JSON object",
    );
  }
  const candidate = input as Partial<BackupData>;
  if (candidate.version === undefined) {
    throw new BackupValidationError(
      "Invalid backup file: missing version field",
    );
  }
  if (candidate.version !== BACKUP_VERSION) {
    throw new BackupValidationError(
      `Unsupported backup format version ${String(candidate.version)} (expected version ${BACKUP_VERSION})`,
    );
  }
  if (
    candidate.data === null ||
    typeof candidate.data !== "object" ||
    Array.isArray(candidate.data)
  ) {
    throw new BackupValidationError("Invalid backup file: missing data");
  }
  for (const table of BACKUP_TABLES) {
    const rows = (candidate.data as Partial<BackupTables>)[table];
    if (rows !== undefined && !Array.isArray(rows)) {
      throw new BackupValidationError(
        `Invalid backup file: data.${table} must be an array`,
      );
    }
  }
  if (
    candidate.covers !== undefined &&
    (candidate.covers === null ||
      typeof candidate.covers !== "object" ||
      Array.isArray(candidate.covers))
  ) {
    throw new BackupValidationError(
      "Invalid backup file: covers must be an object",
    );
  }
}

/** Coerces a JSON value into something better-sqlite3 will bind. */
function toBindable(
  value: unknown,
  column: ColumnInfo,
  table: string,
): string | number | bigint | Buffer | null {
  if (value === null || value === undefined) return null;
  if (column.type === "BLOB") {
    if (typeof value === "string") return Buffer.from(value, "base64");
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
  }
  // Exports keep booleans as 0/1, but a hand-written backup may not.
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number" || typeof value === "bigint") return value;
  if (typeof value === "string") return value;
  throw new Error(
    `Unsupported value for ${table}.${column.name}: ${typeof value}`,
  );
}

type Conflict = "ignore" | "upsert-settings";

interface TableImporter {
  insert(row: BackupRow): number;
}

function makeImporter(
  table: BackupTableName,
  columns: ColumnInfo[],
  conflict: Conflict,
): TableImporter {
  const byName = new Map(columns.map((c) => [c.name, c]));
  const cache = new Map<string, ReturnType<typeof sqlite.prepare>>();

  function statementFor(names: string[]) {
    const key = names.join(",");
    const cached = cache.get(key);
    if (cached) return cached;
    const quoted = names.map((n) => `"${n}"`).join(", ");
    const placeholders = names.map(() => "?").join(", ");
    const prefix = conflict === "ignore" ? "INSERT OR IGNORE" : "INSERT";
    const suffix =
      conflict === "upsert-settings"
        ? ` ON CONFLICT("key") DO UPDATE SET "value" = excluded."value"`
        : "";
    const stmt = sqlite.prepare(
      `${prefix} INTO "${table}" (${quoted}) VALUES (${placeholders})${suffix}`,
    );
    cache.set(key, stmt);
    return stmt;
  }

  return {
    insert(row) {
      const names: string[] = [];
      const values: Array<string | number | bigint | Buffer | null> = [];
      for (const [key, value] of Object.entries(row)) {
        const column = byName.get(key);
        // Column removed by a migration since the backup was taken.
        if (!column) continue;
        names.push(key);
        values.push(toBindable(value, column, table));
      }
      // Every column was dropped, or the row was empty — nothing to write.
      if (names.length === 0) return 0;
      return statementFor(names).run(...values).changes;
    },
  };
}

interface WorkRemap {
  rjPathMap: Map<string, string>;
  duplicates: Map<string, string[]>;
  coversDir: string;
  /** Work id -> cover filename carried by this backup. */
  coverNames: Map<string, string>;
  remapped: number;
  notFound: string[];
}

/**
 * Rewrites the machine-specific paths on a works row.
 *
 * `folder_path` follows the RJ directory wherever it now lives; `cover_path`
 * is rebuilt against this machine's covers directory, since the image itself
 * travels inside the backup.
 */
function remapWorkRow(row: BackupRow, ctx: WorkRemap): BackupRow {
  const id = typeof row.id === "string" ? row.id : null;
  if (!id) return row;

  const out = { ...row };

  if ("folder_path" in out) {
    const found = ctx.rjPathMap.get(id);
    if (found) {
      if (found !== out.folder_path) ctx.remapped++;
      out.folder_path = found;
    } else {
      ctx.notFound.push(id);
    }
  }

  if ("cover_path" in out) {
    const backupCover = ctx.coverNames.get(id);
    if (backupCover) {
      out.cover_path = path.join(ctx.coversDir, backupCover);
    } else if (typeof out.cover_path === "string" && out.cover_path) {
      // No image in the backup, but this machine may already have one.
      const local = path.join(ctx.coversDir, path.basename(out.cover_path));
      out.cover_path = fs.existsSync(local) ? local : null;
    }
  }

  return out;
}

/** Work id -> cover filename, derived from the backup's cover keys. */
function indexCoversByWorkId(covers: Record<string, string>): Map<string, string> {
  const map = new Map<string, string>();
  for (const name of Object.keys(covers)) {
    const id = extractWorkId(path.basename(name, path.extname(name)));
    if (id && !map.has(id)) map.set(id, name);
  }
  return map;
}

/**
 * Restores a backup into the current database.
 *
 * Everything runs in one transaction: on a dry run it is rolled back after the
 * work is done, so the summary reports what *would* have happened. Covers are
 * written only after the transaction commits, since file writes can't roll
 * back with it.
 */
export async function restoreBackup(
  data: BackupData,
  options: RestoreOptions = {},
): Promise<RestoreSummary> {
  validateBackup(data);

  const summary: RestoreSummary = {
    imported: {},
    remapped: 0,
    notFound: [],
    warnings: [],
    errors: [],
  };

  const settings = getSettings();
  const libraryRoots = resolveLibraryRoots(settings.libraryRoots);
  const coversDir = resolveCoversDir(settings.coversDir);
  const covers = data.covers ?? {};

  if (data.schemaVersion > currentSchemaVersion()) {
    summary.warnings.push(
      `Backup was taken at schema version ${data.schemaVersion}, newer than this database (${currentSchemaVersion()}) — unknown columns will be dropped`,
    );
  }

  const { map: rjPathMap, duplicates } = scanRjPaths(libraryRoots);
  const remapCtx: WorkRemap = {
    rjPathMap,
    duplicates,
    coversDir,
    coverNames: indexCoversByWorkId(covers),
    remapped: 0,
    notFound: [],
  };

  const importTables = () => {
    for (const table of BACKUP_TABLES) {
      const rows = data.data[table] ?? [];
      summary.imported[table] = 0;
      if (rows.length === 0) continue;

      const columns = getTableColumnInfo(table);
      if (!columns) {
        summary.warnings.push(
          `Table ${table} no longer exists — ${rows.length} row(s) skipped`,
        );
        continue;
      }

      const importer = makeImporter(
        table,
        columns,
        table === "settings" ? "upsert-settings" : "ignore",
      );
      let failed = 0;
      let firstFailure = "";

      for (const raw of rows) {
        if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
          throw new Error(`Invalid row in ${table}: expected an object`);
        }
        const row =
          table === "works" ? remapWorkRow(raw, remapCtx) : (raw as BackupRow);
        try {
          summary.imported[table] += importer.insert(row);
        } catch (err) {
          // Foreign keys aren't covered by OR IGNORE, so an orphan row (a
          // track whose work was deleted, say) lands here. Skip it and keep
          // going rather than failing the whole restore.
          failed++;
          if (!firstFailure) firstFailure = String(err);
        }
      }

      if (failed > 0) {
        summary.warnings.push(
          `${failed} row(s) in ${table} could not be imported (first error: ${firstFailure})`,
        );
      }
    }

    if (options.dryRun) throw new DryRunRollback();
  };

  let committed = false;
  try {
    sqlite.transaction(importTables)();
    committed = true;
  } catch (err) {
    if (err instanceof DryRunRollback) {
      summary.warnings.push("Dry run — no changes were written");
    } else {
      // The transaction rolled back, so the per-table tallies collected above
      // describe writes that no longer exist. Report zeroes instead.
      for (const table of Object.keys(summary.imported)) {
        summary.imported[table] = 0;
      }
      summary.errors.push(String(err));
      return summary;
    }
  }

  summary.remapped = remapCtx.remapped;
  summary.notFound = remapCtx.notFound;

  for (const id of remapCtx.notFound) {
    summary.warnings.push(
      `Work ${id} not found on disk — run a scan to update its path`,
    );
  }
  for (const [id, paths] of remapCtx.duplicates) {
    summary.warnings.push(
      `Work ${id} appears in multiple library roots: ${paths.join(", ")} — used ${paths[0]}`,
    );
  }
  if ((data.data.settings ?? []).some((row) => isPathSetting(row.key))) {
    summary.warnings.push(
      "Settings contain library paths from the original machine — verify them in Settings",
    );
  }

  summary.imported.covers = await restoreCovers(
    covers,
    coversDir,
    committed,
    summary,
  );

  if (committed) {
    invalidateSearchIndex();
    invalidateFilterListCache();
  }

  return summary;
}

function isPathSetting(key: unknown): boolean {
  return key === "scan.libraryRoot" || key === "scan.coversDir";
}

/**
 * Writes the embedded cover images into the covers directory.
 *
 * Existing files are left alone: a cover replaced in-app after the backup was
 * taken is newer than the one in the file, and the restore shouldn't undo it.
 */
async function restoreCovers(
  covers: Record<string, string>,
  coversDir: string,
  write: boolean,
  summary: RestoreSummary,
): Promise<number> {
  const names = Object.keys(covers);
  if (names.length === 0) return 0;

  if (!write) {
    // Dry run: report the files that don't exist yet without creating any.
    return names.filter((name) => !fs.existsSync(path.join(coversDir, name)))
      .length;
  }

  await fsp.mkdir(coversDir, { recursive: true });
  let written = 0;
  for (const name of names) {
    // Guard against a crafted backup escaping the covers directory.
    const safe = path.basename(name);
    if (safe !== name) {
      summary.warnings.push(`Skipped cover with unsafe filename: ${name}`);
      continue;
    }
    const dest = path.join(coversDir, safe);
    if (fs.existsSync(dest)) continue;
    try {
      await fsp.writeFile(dest, Buffer.from(covers[name], "base64"));
      written++;
    } catch (err) {
      summary.warnings.push(`Failed to write cover ${safe}: ${String(err)}`);
    }
  }
  return written;
}
