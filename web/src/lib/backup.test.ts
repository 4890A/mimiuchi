import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * These run against a real SQLite file in a temp directory.
 *
 * `lib/config` and `lib/db/client` read their environment once, at module
 * load, so the env has to be set before anything imports them — hence the
 * dynamic imports in `before()` rather than static ones at the top.
 *
 *   pnpm -C web test
 */

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kikoeru-backup-test-"));
const dataDir = path.join(tmpRoot, "data");
const coversDir = path.join(tmpRoot, "covers");
const libraryRoot = path.join(tmpRoot, "media");
for (const dir of [dataDir, coversDir, libraryRoot]) {
  fs.mkdirSync(dir, { recursive: true });
}

process.env.KIKOERU_DATA_DIR = dataDir;
process.env.KIKOERU_COVERS_DIR = coversDir;
process.env.KIKOERU_LIBRARY_ROOT = libraryRoot;
process.env.KIKOERU_SESSION_SECRET = "test-secret-not-used-by-these-tests";

let backup: typeof import("./backup");
let sqlite: import("better-sqlite3").Database;

const WORK_ID = "RJ01000380";
const OTHER_WORK_ID = "RJ01000381";
const PEAKS = Buffer.from([0, 17, 128, 255]);
const COVER_BYTES = Buffer.from("fake-jpeg-bytes");

before(async () => {
  backup = await import("./backup");
  ({ sqlite } = await import("./db/client"));
});

after(() => {
  try {
    sqlite?.close();
  } catch {
    // Already closed; nothing to do.
  }
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

beforeEach(() => {
  wipe();
  // Every test starts from a library root with no work folders in it; the
  // ones that care about remapping create their own.
  fs.rmSync(libraryRoot, { recursive: true, force: true });
  fs.mkdirSync(libraryRoot, { recursive: true });
  fs.rmSync(coversDir, { recursive: true, force: true });
  fs.mkdirSync(coversDir, { recursive: true });
});

function wipe(): void {
  sqlite.pragma("foreign_keys = OFF");
  // `track_waveforms` is not a backed-up table, but the seed fills it so the
  // export tests can prove it stays out of the file.
  for (const table of [...backup.BACKUP_TABLES, "track_waveforms"]) {
    sqlite.prepare(`DELETE FROM "${table}"`).run();
  }
  sqlite.pragma("foreign_keys = ON");
}

/** Inserts a small but representative library: 2 works, tracks, cover, blob. */
function seed(): void {
  const coverPath = path.join(coversDir, `${WORK_ID}.jpg`);
  fs.writeFileSync(coverPath, COVER_BYTES);

  sqlite
    .prepare(`INSERT INTO circles (id, name, name_en) VALUES (1, ?, ?)`)
    .run("sample circle", "Sample Circle");
  sqlite
    .prepare(`INSERT INTO voice_actors (id, name, name_en) VALUES (1, ?, ?)`)
    .run("sample VA", null);
  sqlite
    .prepare(`INSERT INTO tags (id, name, name_en, category) VALUES (1, ?, ?, ?)`)
    .run("ASMR", null, "genre");

  const insertWork = sqlite.prepare(
    `INSERT INTO works (id, title, circle_id, nsfw, folder_path, cover_path, created_at)
     VALUES (?, ?, 1, ?, ?, ?, ?)`,
  );
  insertWork.run(
    WORK_ID,
    "Sample Work",
    1,
    `/originally/on/another/machine/${WORK_ID}`,
    coverPath,
    1700000000000,
  );
  insertWork.run(
    OTHER_WORK_ID,
    "Other Work",
    0,
    `/originally/on/another/machine/${OTHER_WORK_ID}`,
    null,
    1700000000001,
  );

  sqlite
    .prepare(`INSERT INTO work_voice_actors (work_id, voice_actor_id) VALUES (?, 1)`)
    .run(WORK_ID);
  sqlite.prepare(`INSERT INTO work_tags (work_id, tag_id) VALUES (?, 1)`).run(WORK_ID);

  sqlite
    .prepare(
      `INSERT INTO tracks (id, work_id, title, relative_path, extension, size_bytes, duration_seconds, track_number)
       VALUES (1, ?, 'Track 01', 'track01.mp3', '.mp3', 12345678, 1200.5, 1)`,
    )
    .run(WORK_ID);

  sqlite.prepare(`INSERT INTO likes (track_id, liked_at) VALUES (1, ?)`).run(1700000000000);
  sqlite
    .prepare(
      `INSERT INTO track_progress (track_id, position_seconds, completed, updated_at)
       VALUES (1, 300.0, 0, ?)`,
    )
    .run(1700000000000);
  sqlite
    .prepare(
      `INSERT INTO track_waveforms (track_id, version, buckets, peaks, created_at)
       VALUES (1, 1, ?, ?, ?)`,
    )
    .run(PEAKS.length, PEAKS, 1700000000000);

  sqlite
    .prepare(`INSERT INTO settings (key, value) VALUES (?, ?)`)
    .run("bookmarks.track.1", "[120.5,600]");
}

function count(table: string): number {
  return (
    sqlite.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number }
  ).n;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

test("export produces valid BackupData", async () => {
  seed();
  const data = await backup.createBackup();

  assert.equal(data.version, backup.BACKUP_VERSION);
  assert.equal(typeof data.createdAt, "string");
  assert.ok(!Number.isNaN(Date.parse(data.createdAt)));

  assert.equal(data.data.circles.length, 1);
  assert.equal(data.data.works.length, 2);
  assert.equal(data.data.tracks.length, 1);
  assert.equal(data.data.likes.length, 1);
  assert.equal(data.data.settings.length, 1);

  // Rows carry SQL column names, not the ORM's camelCase properties.
  assert.ok("folder_path" in data.data.works[0]);
  assert.ok("name_en" in data.data.circles[0]);

  // The cover travels by basename, keyed independently of its directory.
  assert.deepEqual(Object.keys(data.covers), [`${WORK_ID}.jpg`]);
  assert.equal(
    Buffer.from(data.covers[`${WORK_ID}.jpg`], "base64").toString(),
    COVER_BYTES.toString(),
  );
});

test("waveform caches are never exported", async () => {
  seed();
  assert.equal(count("track_waveforms"), 1);

  const data = await backup.createBackup();
  assert.ok(!("track_waveforms" in data.data));
  // Everything else is still there.
  assert.equal(data.data.tracks.length, 1);
});

test("streamBackup emits the same JSON as createBackup", async () => {
  seed();
  const chunks: string[] = [];
  for await (const chunk of backup.streamBackup()) chunks.push(chunk);
  const streamed = JSON.parse(chunks.join("")) as import("./backup").BackupData;
  const direct = await backup.createBackup();

  assert.deepEqual(streamed.data, direct.data);
  assert.deepEqual(streamed.covers, direct.covers);
  assert.equal(streamed.version, direct.version);
});

// ---------------------------------------------------------------------------
// Round trip
// ---------------------------------------------------------------------------

test("full round-trip restores every table", async () => {
  seed();
  const before = await backup.createBackup();
  wipe();
  assert.equal(count("works"), 0);

  const summary = await backup.restoreBackup(before);
  assert.deepEqual(summary.errors, []);

  assert.equal(summary.imported.circles, 1);
  assert.equal(summary.imported.works, 2);
  assert.equal(summary.imported.tracks, 1);
  assert.equal(summary.imported.likes, 1);

  const after = await backup.createBackup();
  // folder_path is intentionally rewritten on restore; everything else must
  // come back byte-identical.
  assert.deepEqual(after.data.tracks, before.data.tracks);
  assert.deepEqual(after.data.likes, before.data.likes);
  assert.deepEqual(after.data.track_progress, before.data.track_progress);
  assert.deepEqual(after.data.work_tags, before.data.work_tags);
  assert.deepEqual(after.data.settings, before.data.settings);
  assert.deepEqual(after.covers, before.covers);
});

test("re-importing the same backup is idempotent", async () => {
  seed();
  const data = await backup.createBackup();
  wipe();

  await backup.restoreBackup(data);
  const second = await backup.restoreBackup(data);

  assert.deepEqual(second.errors, []);
  // Nothing new to write the second time round.
  assert.equal(second.imported.works, 0);
  assert.equal(second.imported.tracks, 0);
  assert.equal(count("works"), 2);
  assert.equal(count("tracks"), 1);
});

test("restore leaves rows added after the backup untouched", async () => {
  seed();
  const data = await backup.createBackup();

  sqlite
    .prepare(
      `INSERT INTO works (id, title, nsfw, folder_path) VALUES ('RJ01999999', 'Added Later', 0, '/added/later')`,
    )
    .run();

  await backup.restoreBackup(data);

  const added = sqlite
    .prepare(`SELECT title FROM works WHERE id = 'RJ01999999'`)
    .get() as { title: string };
  assert.equal(added.title, "Added Later");
  assert.equal(count("works"), 3);
});

// ---------------------------------------------------------------------------
// Schema robustness
// ---------------------------------------------------------------------------

test("import ignores columns the current schema no longer has", async () => {
  seed();
  const data = await backup.createBackup();
  wipe();

  data.data.works = data.data.works.map((row) => ({
    ...row,
    removed_by_a_later_migration: "should be dropped",
  }));

  const summary = await backup.restoreBackup(data);
  assert.deepEqual(summary.errors, []);
  assert.equal(summary.imported.works, 2);
});

test("import falls back to defaults for columns the backup lacks", async () => {
  seed();
  const data = await backup.createBackup();
  wipe();

  // Simulate a backup taken before `nsfw` and `created_at` existed.
  data.data.works = data.data.works.map((row) => {
    const copy = { ...row };
    delete copy.nsfw;
    delete copy.created_at;
    return copy;
  });

  const summary = await backup.restoreBackup(data);
  assert.deepEqual(summary.errors, []);

  const row = sqlite
    .prepare(`SELECT nsfw, created_at FROM works WHERE id = ?`)
    .get(WORK_ID) as { nsfw: number; created_at: number };
  assert.equal(row.nsfw, 0);
  assert.ok(row.created_at > 0);
});

test("filterRow keeps only known columns", () => {
  const valid = backup.getValidColumns("works");
  assert.ok(valid.has("folder_path"));
  assert.ok(!valid.has("nope"));

  const filtered = backup.filterRow({ id: "RJ1", nope: 1 }, valid);
  assert.deepEqual(filtered, { id: "RJ1" });
});

// ---------------------------------------------------------------------------
// Path remapping
// ---------------------------------------------------------------------------

test("path remapping finds RJ directories", async () => {
  seed();
  const data = await backup.createBackup();
  wipe();

  // The work now lives somewhere else entirely, nested a level down.
  const relocated = path.join(libraryRoot, "archive-2024", WORK_ID);
  fs.mkdirSync(relocated, { recursive: true });

  const summary = await backup.restoreBackup(data);
  assert.deepEqual(summary.errors, []);
  assert.equal(summary.remapped, 1);

  const row = sqlite
    .prepare(`SELECT folder_path FROM works WHERE id = ?`)
    .get(WORK_ID) as { folder_path: string };
  assert.equal(row.folder_path, relocated);
});

test("buildRjPathMap maps ids to their directories", async () => {
  const a = path.join(libraryRoot, WORK_ID);
  const b = path.join(libraryRoot, "nested", "deeper", `[circle] ${OTHER_WORK_ID}`);
  fs.mkdirSync(a, { recursive: true });
  fs.mkdirSync(b, { recursive: true });

  const map = await backup.buildRjPathMap([libraryRoot]);
  assert.equal(map.get(WORK_ID), a);
  assert.equal(map.get(OTHER_WORK_ID), b);
});

test("buildRjPathMap picks up an id-less folder only when asked", async () => {
  const loose = path.join(libraryRoot, "Some Album");
  fs.mkdirSync(loose, { recursive: true });
  fs.writeFileSync(path.join(loose, "a.mp3"), Buffer.alloc(16, 1));

  const off = await backup.buildRjPathMap([libraryRoot]);
  assert.equal(
    Array.from(off.values()).includes(loose),
    false,
    "restore must mirror a scan with the setting off",
  );

  const on = await backup.buildRjPathMap([libraryRoot], true);
  assert.ok(
    Array.from(on.values()).includes(loose),
    "otherwise a restored manual work loses its folder",
  );
});

test("work missing from disk keeps its old path and is flagged", async () => {
  seed();
  const data = await backup.createBackup();
  wipe();

  // Only one of the two works exists under the library root.
  fs.mkdirSync(path.join(libraryRoot, WORK_ID), { recursive: true });

  const summary = await backup.restoreBackup(data);
  assert.deepEqual(summary.notFound, [OTHER_WORK_ID]);
  assert.ok(
    summary.warnings.some((w) => w.includes(OTHER_WORK_ID) && w.includes("not found")),
  );

  const row = sqlite
    .prepare(`SELECT folder_path FROM works WHERE id = ?`)
    .get(OTHER_WORK_ID) as { folder_path: string };
  assert.equal(row.folder_path, `/originally/on/another/machine/${OTHER_WORK_ID}`);
});

test("duplicate RJ directories use the first match and warn", async () => {
  seed();
  const data = await backup.createBackup();
  wipe();

  const first = path.join(libraryRoot, "a", WORK_ID);
  const second = path.join(libraryRoot, "b", WORK_ID);
  fs.mkdirSync(first, { recursive: true });
  fs.mkdirSync(second, { recursive: true });

  const summary = await backup.restoreBackup(data);
  assert.ok(
    summary.warnings.some(
      (w) => w.includes(WORK_ID) && w.includes("multiple library roots"),
    ),
  );

  const row = sqlite
    .prepare(`SELECT folder_path FROM works WHERE id = ?`)
    .get(WORK_ID) as { folder_path: string };
  assert.ok([first, second].includes(row.folder_path));
});

test("cover_path is rebuilt against this machine's covers directory", async () => {
  seed();
  const data = await backup.createBackup();
  wipe();
  fs.rmSync(coversDir, { recursive: true, force: true });

  const summary = await backup.restoreBackup(data);
  assert.equal(summary.imported.covers, 1);

  const row = sqlite
    .prepare(`SELECT cover_path FROM works WHERE id = ?`)
    .get(WORK_ID) as { cover_path: string };
  assert.equal(row.cover_path, path.join(coversDir, `${WORK_ID}.jpg`));
  assert.deepEqual(fs.readFileSync(row.cover_path), COVER_BYTES);
});

test("an existing cover file is not overwritten", async () => {
  seed();
  const data = await backup.createBackup();
  wipe();

  const dest = path.join(coversDir, `${WORK_ID}.jpg`);
  fs.writeFileSync(dest, Buffer.from("newer-cover-replaced-in-app"));

  const summary = await backup.restoreBackup(data);
  assert.equal(summary.imported.covers, 0);
  assert.equal(fs.readFileSync(dest).toString(), "newer-cover-replaced-in-app");
});

// ---------------------------------------------------------------------------
// Dry run and validation
// ---------------------------------------------------------------------------

test("dry run reports counts but writes nothing", async () => {
  seed();
  const data = await backup.createBackup();
  wipe();
  fs.rmSync(coversDir, { recursive: true, force: true });
  fs.mkdirSync(coversDir, { recursive: true });

  const summary = await backup.restoreBackup(data, { dryRun: true });

  assert.deepEqual(summary.errors, []);
  assert.equal(summary.imported.works, 2);
  assert.equal(summary.imported.tracks, 1);
  assert.equal(summary.imported.covers, 1);
  assert.ok(summary.warnings.some((w) => w.includes("Dry run")));

  // ...and none of it landed.
  assert.equal(count("works"), 0);
  assert.equal(count("tracks"), 0);
  assert.equal(fs.readdirSync(coversDir).length, 0);
});

test("waveforms carried by an older backup are ignored", async () => {
  seed();
  const data = await backup.createBackup();
  wipe();

  // Backups taken while the export still included waveforms.
  (data.data as Record<string, unknown>).track_waveforms = [
    {
      track_id: 1,
      version: 1,
      buckets: PEAKS.length,
      peaks: PEAKS.toString("base64"),
      created_at: 1700000000000,
    },
  ];

  const summary = await backup.restoreBackup(data);
  assert.deepEqual(summary.errors, []);
  assert.equal(summary.imported.track_waveforms, undefined);
  assert.equal(count("track_waveforms"), 0);
  assert.equal(count("tracks"), 1);
});

test("validateBackup rejects malformed payloads", () => {
  assert.throws(
    () => backup.validateBackup(null),
    /expected a JSON object/,
  );
  assert.throws(
    () => backup.validateBackup({ data: {} }),
    /missing version field/,
  );
  assert.throws(
    () => backup.validateBackup({ version: 99, data: {} }),
    /Unsupported backup format version 99/,
  );
  assert.throws(
    () => backup.validateBackup({ version: backup.BACKUP_VERSION }),
    /missing data/,
  );
  assert.throws(
    () =>
      backup.validateBackup({
        version: backup.BACKUP_VERSION,
        data: { works: "nope" },
      }),
    /data\.works must be an array/,
  );
  assert.doesNotThrow(() =>
    backup.validateBackup({ version: backup.BACKUP_VERSION, data: {} }),
  );
});

test("orphaned rows are skipped with a warning rather than failing", async () => {
  seed();
  const data = await backup.createBackup();
  wipe();

  // A track whose work never made it into the backup violates a foreign key,
  // which `INSERT OR IGNORE` does not cover.
  data.data.works = [];

  const summary = await backup.restoreBackup(data);
  assert.deepEqual(summary.errors, []);
  assert.equal(summary.imported.tracks, 0);
  assert.ok(summary.warnings.some((w) => w.includes("tracks")));
});
