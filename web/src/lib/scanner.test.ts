// Must come first — points the data/covers/library dirs at a temp tree before
// `lib/config` and `lib/db/client` read the environment.
import { cleanupTmp, coversDir, libraryRoot, resetDir } from "../test/env";

import { after, afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { mockNet, stubGlobalFetch, type MockNet, type StubbedFetch } from "../test/net";
import { scanLibrary, type ScanEvent } from "./scanner";
import { BACKUP_TABLES } from "./backup";
import { sqlite } from "./db/client";

/**
 * End-to-end scan: a fake library on disk + a stubbed DLsite + the real
 * database. Nothing here touches the network or the user's media.
 *
 * The metadata replies are the recorded RJ01678210 response, so the rows this
 * asserts on are the rows a real scan would write.
 */

const API = (id: string) => `/maniax/api/=/product.json?workno=${id}`;
const DLSITE = "https://www.dlsite.com";
const IMG = "https://img.dlsite.jp";
const COVER_PATH =
  "/modpub/images2/work/doujin/RJ01679000/RJ01678210_img_main.jpg";

const WORK_ID = "RJ01678210";
const COVER_BYTES = Buffer.alloc(2048, 7);

const FIXTURE = JSON.parse(
  fs.readFileSync(
    new URL("./metadata/__fixtures__/dlsite-RJ01678210.json", import.meta.url),
    "utf8",
  ),
) as Array<Record<string, unknown>>;

let net: MockNet;
let hvdb: StubbedFetch;

beforeEach(() => {
  wipeDb();
  resetDir(libraryRoot);
  resetDir(coversDir);

  net = mockNet();
  // HVDB uses the global fetch, and is only consulted when DLsite comes up
  // empty. Answering 404 keeps the fallback path quiet and offline.
  hvdb = stubGlobalFetch(() => ({ status: 404, body: "" }));
});

afterEach(() => {
  net.restore();
  hvdb.restore();
});

after(() => {
  sqlite.close();
  cleanupTmp();
});

function wipeDb(): void {
  sqlite.pragma("foreign_keys = OFF");
  for (const table of BACKUP_TABLES) {
    sqlite.prepare(`DELETE FROM "${table}"`).run();
  }
  sqlite.pragma("foreign_keys = ON");
}

/** Creates `<libraryRoot>/<folder>/<file>` for each file, with dummy content. */
function makeWork(folder: string, files: string[]): string {
  const dir = path.join(libraryRoot, folder);
  for (const file of files) {
    const full = path.join(dir, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, Buffer.alloc(1024, 1));
  }
  return dir;
}

/** Creates `<libraryRoot>/<name>` as a dummy archive file. */
function makeArchive(name: string): string {
  const full = path.join(libraryRoot, name);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, Buffer.alloc(64, 2));
  return full;
}

/** Queues the DLsite metadata + cover replies for a successful lookup. */
function stubDlsite(times = 1): void {
  net.reply(DLSITE, API(WORK_ID), FIXTURE, { times });
  net.reply(IMG, COVER_PATH, COVER_BYTES, { times });
}

/** Queues 404s for every id variant the fetcher will try. */
function stubMissing(...ids: string[]): void {
  for (const id of ids) net.reply(DLSITE, API(id), [], { status: 404 });
}

function scan(overrides: Partial<Parameters<typeof scanLibrary>[0]> = {}) {
  const events: ScanEvent[] = [];
  const run = scanLibrary({
    libraryRoots: [libraryRoot],
    coversDir,
    onEvent: (e) => events.push(e),
    ...overrides,
  });
  return { run, events };
}

function workRow(id: string) {
  return sqlite.prepare(`SELECT * FROM works WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
}

function trackPaths(id: string): string[] {
  return (
    sqlite
      .prepare(`SELECT relative_path FROM tracks WHERE work_id = ? ORDER BY relative_path`)
      .all(id) as Array<{ relative_path: string }>
  ).map((r) => r.relative_path);
}

// ---------------------------------------------------------------------------
// The happy path
// ---------------------------------------------------------------------------

test("imports a work, its metadata, its cover and its tracks", async () => {
  makeWork(WORK_ID, ["01 Intro.mp3", "02 Main.flac"]);
  stubDlsite();

  const { run } = scan();
  const result = await run;

  assert.deepEqual(result.errors, []);
  assert.equal(result.worksFound, 1);
  assert.equal(result.worksNew, 1);
  assert.equal(result.tracksScanned, 2);
  assert.equal(result.metadataFetched, 1);

  const work = workRow(WORK_ID);
  assert.ok(work, "the work should exist");
  assert.equal(work.title, "【ブルーアーカイブ】セイアASMR～太陽と月と言葉と君の～");
  assert.equal(work.nsfw, 0, "an all-ages work must not be flagged NSFW");
  assert.equal(work.age_rating, "all");
  assert.equal(work.metadata_source, "dlsite");
  assert.equal(work.folder_path, path.join(libraryRoot, WORK_ID));

  // Related rows come from the same response.
  const circle = sqlite
    .prepare(`SELECT name FROM circles WHERE id = ?`)
    .get(work.circle_id) as { name: string };
  assert.equal(circle.name, "Yostar");

  const vas = sqlite
    .prepare(
      `SELECT va.name FROM voice_actors va
       JOIN work_voice_actors wva ON wva.voice_actor_id = va.id
       WHERE wva.work_id = ?`,
    )
    .all(WORK_ID) as Array<{ name: string }>;
  assert.deepEqual(vas.map((v) => v.name), ["種﨑敦美"]);

  const tags = sqlite
    .prepare(
      `SELECT t.name FROM tags t
       JOIN work_tags wt ON wt.tag_id = t.id
       WHERE wt.work_id = ?`,
    )
    .all(WORK_ID) as Array<{ name: string }>;
  assert.deepEqual(
    tags.map((t) => t.name).sort(),
    ["ASMR", "バイノーラル/ダミヘ", "萌え", "癒し"].sort(),
  );

  // The cover was downloaded to disk and recorded against the work.
  const coverFile = path.join(coversDir, `${WORK_ID}.jpg`);
  assert.equal(work.cover_path, coverFile);
  assert.deepEqual(fs.readFileSync(coverFile), COVER_BYTES);

  net.assertAllConsumed();
});

test("emits a coherent event stream", async () => {
  makeWork(WORK_ID, ["01 Intro.mp3"]);
  stubDlsite();

  const { run, events } = scan();
  await run;

  const types = events.map((e) => e.type);
  assert.deepEqual(types, [
    "start",
    "work-start",
    "fetch-meta",
    "meta-result",
    "fetch-cover",
    "cover-saved",
    "tracks-done",
    "work-done",
    "done",
  ]);

  const start = events[0] as Extract<ScanEvent, { type: "start" }>;
  assert.equal(start.total, 1);
  assert.deepEqual(start.libraryRoots, [libraryRoot]);

  const metaResult = events.find((e) => e.type === "meta-result");
  assert.equal(metaResult?.found, true);
  assert.equal(metaResult?.source, "dlsite");

  const workStart = events.find((e) => e.type === "work-start");
  assert.equal(workStart?.hadExisting, false, "first scan has nothing on record");

  const done = events.at(-1) as Extract<ScanEvent, { type: "done" }>;
  assert.equal(done.result.worksFound, 1);
});

// ---------------------------------------------------------------------------
// Folder discovery
// ---------------------------------------------------------------------------

test("finds works nested under other directories", async () => {
  makeWork(path.join("archive", "2026", `[Yostar] ${WORK_ID}`), ["a.mp3"]);
  stubDlsite();

  const result = await scan().run;
  assert.equal(result.worksFound, 1);
  assert.equal(
    workRow(WORK_ID)?.folder_path,
    path.join(libraryRoot, "archive", "2026", `[Yostar] ${WORK_ID}`),
  );
});

test("ignores folders with no work id in the name", async () => {
  makeWork("Some Album", ["a.mp3"]);
  makeWork("loose-files", ["b.mp3"]);

  const result = await scan().run;
  assert.equal(result.worksFound, 0);
  assert.equal(result.tracksScanned, 0);
});

test("indexes only audio files", async () => {
  makeWork(WORK_ID, [
    "01 Intro.mp3",
    "02 Main.flac",
    "03 Extra.m4a",
    "04 Loop.opus",
    "cover.jpg",
    "readme.txt",
    "notes.pdf",
  ]);
  stubDlsite();

  const result = await scan().run;
  assert.equal(result.tracksScanned, 4);
  assert.deepEqual(trackPaths(WORK_ID), [
    "01 Intro.mp3",
    "02 Main.flac",
    "03 Extra.m4a",
    "04 Loop.opus",
  ]);
});

test("walks subdirectories inside a work and keeps relative paths", async () => {
  makeWork(WORK_ID, ["01 Intro.mp3", path.join("extras", "99 Bonus.mp3")]);
  stubDlsite();

  await scan().run;
  assert.deepEqual(trackPaths(WORK_ID), [
    "01 Intro.mp3",
    path.join("extras", "99 Bonus.mp3"),
  ]);
});

test("the first library root wins when a work appears in two", async () => {
  const second = path.join(libraryRoot, "..", "media-2");
  fs.mkdirSync(path.join(second, WORK_ID), { recursive: true });
  fs.writeFileSync(path.join(second, WORK_ID, "dupe.mp3"), Buffer.alloc(16));
  makeWork(WORK_ID, ["primary.mp3"]);
  stubDlsite();

  try {
    const result = await scan({ libraryRoots: [libraryRoot, second] }).run;
    assert.equal(result.worksFound, 1);
    assert.equal(workRow(WORK_ID)?.folder_path, path.join(libraryRoot, WORK_ID));
    assert.deepEqual(trackPaths(WORK_ID), ["primary.mp3"]);
  } finally {
    fs.rmSync(second, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Archives
// ---------------------------------------------------------------------------

test("indexes a work that is still packed in a zip", async () => {
  const archive = makeArchive(`【${WORK_ID}】【MP3】【2026-08-03】.zip`);
  stubDlsite();

  const result = await scan().run;

  assert.equal(result.worksFound, 1);
  assert.equal(result.worksNew, 1);
  assert.equal(result.tracksScanned, 0, "there is nothing to index inside it");
  assert.equal(result.metadataFetched, 1, "metadata comes from the id alone");

  const work = workRow(WORK_ID);
  assert.equal(work?.is_archive, 1);
  assert.equal(work?.folder_path, archive, "the path points at the file itself");
  assert.equal(work?.title, "【ブルーアーカイブ】セイアASMR～太陽と月と言葉と君の～");
  assert.equal(work?.cover_path, path.join(coversDir, `${WORK_ID}.jpg`));
});

test("recognises rar and 7z, and ignores other loose files", async () => {
  makeArchive("RJ236823.rar");
  makeArchive("RJ111111.7z");
  makeArchive("RJ222222.txt");
  makeArchive("no-id-here.zip");
  stubMissing("RJ236823", "RJ00236823", "RJ111111", "RJ00111111");

  const result = await scan().run;
  assert.equal(result.worksFound, 2);
  assert.equal(workRow("RJ236823")?.is_archive, 1);
  assert.equal(workRow("RJ111111")?.is_archive, 1);
  assert.equal(workRow("RJ222222"), undefined);
});

test("finds archives nested under other directories", async () => {
  makeArchive(path.join("inbox", "2026", `${WORK_ID}.zip`));
  stubDlsite();

  const result = await scan().run;
  assert.equal(result.worksFound, 1);
  assert.equal(workRow(WORK_ID)?.is_archive, 1);
});

test("the extracted folder wins while the archive is still there", async () => {
  makeArchive(`${WORK_ID}.zip`);
  makeWork(WORK_ID, ["01 Intro.mp3"]);
  stubDlsite();

  const result = await scan().run;

  assert.equal(result.worksFound, 1, "one work, not one per copy");
  const work = workRow(WORK_ID);
  assert.equal(work?.is_archive, 0);
  assert.equal(work?.folder_path, path.join(libraryRoot, WORK_ID));
  assert.deepEqual(trackPaths(WORK_ID), ["01 Intro.mp3"]);
});

test("extracting an archived work replaces the entry instead of duplicating it", async () => {
  makeArchive(`${WORK_ID}.zip`);
  stubDlsite();
  await scan().run;
  assert.equal(workRow(WORK_ID)?.is_archive, 1);

  // The user extracts the archive and deletes it, then re-scans.
  fs.rmSync(path.join(libraryRoot, `${WORK_ID}.zip`));
  makeWork(WORK_ID, ["01 Intro.mp3"]);

  const result = await scan().run;

  assert.equal(
    (sqlite.prepare(`SELECT COUNT(*) AS n FROM works`).get() as { n: number }).n,
    1,
    "the work is keyed by its id, so there is nothing to duplicate",
  );
  assert.equal(result.worksSkipped, 0, "packed -> extracted is never skipped");
  const work = workRow(WORK_ID);
  assert.equal(work?.is_archive, 0);
  assert.equal(work?.folder_path, path.join(libraryRoot, WORK_ID));
  assert.deepEqual(trackPaths(WORK_ID), ["01 Intro.mp3"]);
});

test("re-packing a work keeps its tracks, likes and progress", async () => {
  makeWork(WORK_ID, ["01 Intro.mp3"]);
  stubDlsite();
  await scan().run;

  const trackId = (
    sqlite.prepare(`SELECT id FROM tracks WHERE work_id = ?`).get(WORK_ID) as {
      id: number;
    }
  ).id;
  sqlite.prepare(`INSERT INTO likes (track_id) VALUES (?)`).run(trackId);

  // The folder goes away; only the archive is left.
  fs.rmSync(path.join(libraryRoot, WORK_ID), { recursive: true });
  makeArchive(`${WORK_ID}.zip`);

  const result = await scan().run;

  assert.equal(result.worksSkipped, 0);
  assert.equal(workRow(WORK_ID)?.is_archive, 1);
  assert.deepEqual(
    trackPaths(WORK_ID),
    ["01 Intro.mp3"],
    "pruning here would cascade the likes away with the tracks",
  );
  assert.equal(
    (
      sqlite.prepare(`SELECT COUNT(*) AS n FROM likes`).get() as { n: number }
    ).n,
    1,
  );
});

test("a second scan skips an unchanged archive", async () => {
  makeArchive(`${WORK_ID}.zip`);
  stubDlsite();
  await scan().run;

  // No interceptors queued: a network call now would fail the test.
  const result = await scan().run;
  assert.equal(result.worksSkipped, 1);
  assert.equal(result.metadataFetched, 0);
});

// ---------------------------------------------------------------------------
// Track titles
// ---------------------------------------------------------------------------

test("derives track numbers and strips them from the title", async () => {
  makeWork(WORK_ID, ["01 Intro.mp3", "02_Main.mp3", "10.Bonus.mp3", "Untitled.mp3"]);
  stubDlsite();
  await scan().run;

  const rows = sqlite
    .prepare(
      `SELECT relative_path, title, track_number FROM tracks
       WHERE work_id = ? ORDER BY relative_path`,
    )
    .all(WORK_ID) as Array<{
    relative_path: string;
    title: string;
    track_number: number | null;
  }>;

  assert.deepEqual(rows, [
    { relative_path: "01 Intro.mp3", title: "Intro", track_number: 1 },
    { relative_path: "02_Main.mp3", title: "Main", track_number: 2 },
    { relative_path: "10.Bonus.mp3", title: "Bonus", track_number: 10 },
    // No leading number, so the whole basename is the title.
    { relative_path: "Untitled.mp3", title: "Untitled", track_number: null },
  ]);
});

test("a title that is only a track number keeps the number as its title", async () => {
  makeWork(WORK_ID, ["01 .mp3"]);
  stubDlsite();
  await scan().run;

  const row = sqlite
    .prepare(`SELECT title, track_number FROM tracks WHERE work_id = ?`)
    .get(WORK_ID) as { title: string; track_number: number };
  assert.equal(row.track_number, 1);
  assert.equal(row.title, "01 ", "falls back to the basename rather than going blank");
});

// ---------------------------------------------------------------------------
// Rescanning
// ---------------------------------------------------------------------------

test("a second scan skips a work that is already complete and unchanged", async () => {
  makeWork(WORK_ID, ["01 Intro.mp3"]);
  stubDlsite();
  await scan().run;

  // No new interceptors queued: a network call now would fail the test.
  const { run, events } = scan();
  const result = await run;

  assert.equal(result.worksSkipped, 1);
  assert.equal(result.metadataFetched, 0);
  assert.equal(result.tracksScanned, 0, "skipped works are not re-walked");
  assert.ok(!events.some((e) => e.type === "fetch-meta"));
});

test("forceMetadata re-fetches even an up-to-date work", async () => {
  makeWork(WORK_ID, ["01 Intro.mp3"]);
  stubDlsite();
  await scan().run;

  stubDlsite();
  const result = await scan({ forceMetadata: true }).run;

  assert.equal(result.worksSkipped, 0);
  assert.equal(result.metadataFetched, 1);
  net.assertAllConsumed();
});

test("a work is re-fetched when its cover file has gone missing", async () => {
  makeWork(WORK_ID, ["01 Intro.mp3"]);
  stubDlsite();
  await scan().run;

  fs.rmSync(path.join(coversDir, `${WORK_ID}.jpg`));

  stubDlsite();
  const result = await scan().run;
  assert.equal(result.worksSkipped, 0);
  assert.equal(result.metadataFetched, 1);
  assert.ok(fs.existsSync(path.join(coversDir, `${WORK_ID}.jpg`)), "cover restored");
});

test("tracks deleted from disk are pruned from the database", async () => {
  makeWork(WORK_ID, ["01 Intro.mp3", "02 Main.mp3"]);
  stubDlsite();
  await scan().run;
  assert.equal(trackPaths(WORK_ID).length, 2);

  fs.rmSync(path.join(libraryRoot, WORK_ID, "02 Main.mp3"));

  // forceMetadata bypasses the quick-skip so the track walk actually runs.
  stubDlsite();
  await scan({ forceMetadata: true }).run;

  assert.deepEqual(trackPaths(WORK_ID), ["01 Intro.mp3"]);
});

test("new tracks are picked up without duplicating existing rows", async () => {
  makeWork(WORK_ID, ["01 Intro.mp3"]);
  stubDlsite();
  await scan().run;

  makeWork(WORK_ID, ["02 Main.mp3"]);
  stubDlsite();
  await scan({ forceMetadata: true }).run;

  assert.deepEqual(trackPaths(WORK_ID), ["01 Intro.mp3", "02 Main.mp3"]);
});

test("filterIds limits the scan to the listed works", async () => {
  makeWork(WORK_ID, ["a.mp3"]);
  makeWork("RJ236823", ["b.mp3"]);
  stubDlsite();

  const result = await scan({ filterIds: new Set([WORK_ID]) }).run;

  assert.equal(result.worksFound, 1);
  assert.ok(workRow(WORK_ID));
  assert.equal(workRow("RJ236823"), undefined, "the excluded work is untouched");
});

// ---------------------------------------------------------------------------
// Failure handling
// ---------------------------------------------------------------------------

test("a work with no metadata anywhere is still indexed", async () => {
  makeWork("RJ236823", ["01 Intro.mp3"]);
  // Both DLsite id variants miss, and the HVDB stub 404s.
  stubMissing("RJ236823", "RJ00236823");

  const result = await scan().run;

  assert.equal(result.worksFound, 1);
  assert.equal(result.metadataFetched, 0);
  assert.equal(result.tracksScanned, 1, "tracks are indexed regardless");
  assert.ok(result.errors.some((e) => e.includes("No metadata found for RJ236823")));

  const work = workRow("RJ236823");
  assert.ok(work, "the work is created so its files are still playable");
  assert.equal(work.title, "RJ236823", "the id stands in for a title");
  assert.equal(work.metadata_source, null);
  assert.equal(work.cover_path, null);
});

test("both id variants are tried before giving up", async () => {
  makeWork("RJ236823", ["a.mp3"]);
  // The zero-padded variant is the one that resolves.
  net.reply(DLSITE, API("RJ236823"), [], { status: 404 });
  net.reply(DLSITE, API("RJ00236823"), FIXTURE);
  net.reply(IMG, COVER_PATH, COVER_BYTES);

  const result = await scan().run;

  assert.equal(result.metadataFetched, 1);
  // The id on disk wins over the workno DLsite echoed back, so the row still
  // matches the folder it came from.
  const work = workRow("RJ236823");
  assert.equal(work?.title, "【ブルーアーカイブ】セイアASMR～太陽と月と言葉と君の～");
  assert.equal(workRow(WORK_ID), undefined);
  net.assertAllConsumed();
});

test("a network failure leaves the work indexed and records an error", async () => {
  makeWork("RJ236823", ["a.mp3"]);
  for (const id of ["RJ236823", "RJ00236823"]) {
    net.agent
      .get(DLSITE)
      .intercept({ path: API(id), method: "GET" })
      .replyWithError(new Error("ECONNRESET"));
  }

  const result = await scan().run;

  assert.equal(result.metadataFetched, 0);
  assert.ok(workRow("RJ236823"), "a transport failure must not lose the work");
  assert.equal(result.tracksScanned, 1);
});

test("a failed cover download does not fail the work", async () => {
  makeWork(WORK_ID, ["a.mp3"]);
  net.reply(DLSITE, API(WORK_ID), FIXTURE);
  net.reply(IMG, COVER_PATH, "gone", { status: 500 });

  const result = await scan().run;

  assert.deepEqual(result.errors, []);
  assert.equal(result.metadataFetched, 1);
  const work = workRow(WORK_ID);
  assert.equal(work?.title, "【ブルーアーカイブ】セイアASMR～太陽と月と言葉と君の～");
  assert.equal(work?.cover_path, null, "no cover, but the metadata still landed");
});

test("no library roots is an error, not a crash", async () => {
  const { run, events } = scan({ libraryRoots: [] });
  const result = await run;

  assert.deepEqual(result.errors, ["No library roots configured"]);
  assert.equal(result.worksFound, 0);
  assert.equal(events.at(-1)?.type, "done");
});

test("a library root that does not exist is skipped quietly", async () => {
  makeWork(WORK_ID, ["a.mp3"]);
  stubDlsite();

  const result = await scan({
    libraryRoots: [libraryRoot, path.join(libraryRoot, "..", "does-not-exist")],
  }).run;

  assert.equal(result.worksFound, 1);
  assert.deepEqual(result.errors, []);
});

test("an empty library scans cleanly", async () => {
  const result = await scan().run;
  assert.equal(result.worksFound, 0);
  assert.equal(result.tracksScanned, 0);
  assert.deepEqual(result.errors, []);
});

test("a work folder with no audio files still gets a row", async () => {
  makeWork(WORK_ID, ["readme.txt"]);
  stubDlsite();

  const result = await scan().run;
  assert.equal(result.worksFound, 1);
  assert.equal(result.tracksScanned, 0);
  assert.ok(workRow(WORK_ID));
});
