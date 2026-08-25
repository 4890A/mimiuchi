// Must come first — it points KIKOERU_DATA_DIR at a temp dir before
// `db/client` reads the environment and opens SQLite.
import { cleanupTmp } from "../test/env";

import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  addBookmark,
  deleteBookmarksForTracks,
  getBookmarks,
  getBookmarksForTracks,
  removeBookmark,
} from "./bookmarks";
import { sqlite } from "./db/client";

/**
 * Bookmarks live as JSON blobs in the `settings` key/value table rather than a
 * table of their own, so these tests check the persistence shape as well as
 * the merge/remove tolerance behaviour.
 */

const TRACK = 1;
const OTHER = 2;

/** Distinct bookmarks must be further apart than this. */
const TOLERANCE = 0.25;

beforeEach(() => {
  sqlite.prepare(`DELETE FROM settings`).run();
});

after(() => {
  sqlite.close();
  cleanupTmp();
});

function rawRow(trackId: number): string | undefined {
  const row = sqlite
    .prepare(`SELECT value FROM settings WHERE key = ?`)
    .get(`bookmarks.track.${trackId}`) as { value: string } | undefined;
  return row?.value;
}

function settingsRowCount(): number {
  return (sqlite.prepare(`SELECT COUNT(*) AS n FROM settings`).get() as { n: number })
    .n;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

test("a track with no bookmarks reads as an empty list", () => {
  assert.deepEqual(getBookmarks(TRACK), []);
});

test("bookmarks come back sorted regardless of insertion order", () => {
  addBookmark(TRACK, 300);
  addBookmark(TRACK, 60);
  addBookmark(TRACK, 900);
  assert.deepEqual(getBookmarks(TRACK), [60, 300, 900]);
});

test("positions are rounded to milliseconds", () => {
  addBookmark(TRACK, 12.3456789);
  assert.deepEqual(getBookmarks(TRACK), [12.346]);
  // ...and stored that way, so the JSON stays compact.
  assert.equal(rawRow(TRACK), "[12.346]");
});

test("a negative position is clamped to zero", () => {
  addBookmark(TRACK, -5);
  assert.deepEqual(getBookmarks(TRACK), [0]);
});

// ---------------------------------------------------------------------------
// Adding
// ---------------------------------------------------------------------------

test("adding returns the new full list", () => {
  assert.deepEqual(addBookmark(TRACK, 10), [10]);
  assert.deepEqual(addBookmark(TRACK, 20), [10, 20]);
});

test("a second bookmark inside the merge tolerance is ignored", () => {
  addBookmark(TRACK, 100);
  const after = addBookmark(TRACK, 100 + TOLERANCE / 2);
  assert.deepEqual(after, [100], "a double right-click must not stack");
});

test("the tolerance boundary is inclusive", () => {
  addBookmark(TRACK, 100);
  assert.deepEqual(addBookmark(TRACK, 100 + TOLERANCE), [100], "exactly at tolerance merges");
  assert.deepEqual(
    addBookmark(TRACK, 100 + TOLERANCE + 0.001),
    [100, 100.251],
    "just past tolerance is a new bookmark",
  );
});

test("tolerance applies in both directions", () => {
  addBookmark(TRACK, 100);
  assert.deepEqual(addBookmark(TRACK, 99.9), [100]);
});

test("bookmarks are per track", () => {
  addBookmark(TRACK, 10);
  addBookmark(OTHER, 20);
  assert.deepEqual(getBookmarks(TRACK), [10]);
  assert.deepEqual(getBookmarks(OTHER), [20]);
  assert.equal(settingsRowCount(), 2);
});

test("a track is capped at 500 bookmarks", () => {
  // Spaced past the tolerance so none of them merge.
  for (let i = 0; i < 500; i++) addBookmark(TRACK, i);
  assert.equal(getBookmarks(TRACK).length, 500);

  const after = addBookmark(TRACK, 10_000);
  assert.equal(after.length, 500, "the cap holds");
  assert.ok(!after.includes(10_000));
});

// ---------------------------------------------------------------------------
// Removing
// ---------------------------------------------------------------------------

test("removing takes the bookmark out and returns the rest", () => {
  addBookmark(TRACK, 10);
  addBookmark(TRACK, 20);
  assert.deepEqual(removeBookmark(TRACK, 10), [20]);
  assert.deepEqual(getBookmarks(TRACK), [20]);
});

test("removing tolerates an imprecise position", () => {
  addBookmark(TRACK, 42.5);
  assert.deepEqual(removeBookmark(TRACK, 42.6), []);
});

test("only the closest bookmark is removed", () => {
  // Two entries both within tolerance of the requested position; a naive
  // filter would drop both.
  addBookmark(TRACK, 100);
  addBookmark(TRACK, 100.3);
  assert.deepEqual(getBookmarks(TRACK), [100, 100.3]);

  assert.deepEqual(removeBookmark(TRACK, 100.28), [100]);
});

test("removing a position with no bookmark changes nothing", () => {
  addBookmark(TRACK, 10);
  assert.deepEqual(removeBookmark(TRACK, 500), [10]);
  assert.deepEqual(getBookmarks(TRACK), [10]);
});

test("removing from a track with none is a no-op", () => {
  assert.deepEqual(removeBookmark(TRACK, 10), []);
});

test("removing the last bookmark deletes the row rather than storing []", () => {
  addBookmark(TRACK, 10);
  assert.equal(settingsRowCount(), 1);

  assert.deepEqual(removeBookmark(TRACK, 10), []);
  assert.equal(rawRow(TRACK), undefined, "empty rows must not linger");
  assert.equal(settingsRowCount(), 0);
});

// ---------------------------------------------------------------------------
// Batch reads
// ---------------------------------------------------------------------------

test("batch read returns an entry for every requested track", () => {
  addBookmark(TRACK, 10);
  const out = getBookmarksForTracks([TRACK, OTHER, 99]);

  assert.deepEqual(out[TRACK], [10]);
  // Present-but-empty distinguishes "loaded, none" from "not loaded".
  assert.deepEqual(out[OTHER], []);
  assert.deepEqual(out[99], []);
  assert.deepEqual(Object.keys(out).sort(), ["1", "2", "99"]);
});

test("batch read of no tracks returns an empty object without querying", () => {
  assert.deepEqual(getBookmarksForTracks([]), {});
});

test("batch read does not pick up unrelated settings rows", () => {
  addBookmark(TRACK, 10);
  sqlite
    .prepare(`INSERT INTO settings (key, value) VALUES ('dlsite.proxy.url', 'x')`)
    .run();

  const out = getBookmarksForTracks([TRACK]);
  assert.deepEqual(out, { [TRACK]: [10] });
});

// ---------------------------------------------------------------------------
// Corrupt data — a bad row must not break the track list
// ---------------------------------------------------------------------------

function writeRaw(trackId: number, value: string): void {
  sqlite
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(`bookmarks.track.${trackId}`, value);
}

test("unparseable JSON reads as no bookmarks", () => {
  writeRaw(TRACK, "{not json");
  assert.deepEqual(getBookmarks(TRACK), []);
});

test("valid JSON that is not an array reads as no bookmarks", () => {
  writeRaw(TRACK, '{"a":1}');
  assert.deepEqual(getBookmarks(TRACK), []);
  writeRaw(TRACK, "42");
  assert.deepEqual(getBookmarks(TRACK), []);
});

test("non-numeric and negative entries are dropped from a stored list", () => {
  writeRaw(TRACK, '[10, "20", null, -5, 30, 1e999]');
  // Strings, null, negatives and Infinity all fail the filter; 10 and 30 stay.
  assert.deepEqual(getBookmarks(TRACK), [10, 30]);
});

test("a corrupt row still sorts and rounds what survives", () => {
  writeRaw(TRACK, "[30.00049, 10.5, 20]");
  assert.deepEqual(getBookmarks(TRACK), [10.5, 20, 30]);
});

test("adding to a corrupt row repairs it", () => {
  writeRaw(TRACK, "garbage");
  assert.deepEqual(addBookmark(TRACK, 15), [15]);
  assert.equal(rawRow(TRACK), "[15]");
});

// ---------------------------------------------------------------------------
// Cleanup when tracks go away
// ---------------------------------------------------------------------------

test("deleting tracks takes their bookmark rows with them", () => {
  addBookmark(TRACK, 10);
  addBookmark(OTHER, 20);
  assert.equal(settingsRowCount(), 2);

  deleteBookmarksForTracks([TRACK]);

  // Nothing cascades these away on its own: they are keyed by track id in the
  // settings table rather than joined to `tracks`, so without this they would
  // outlive the track forever.
  assert.equal(rawRow(TRACK), undefined);
  assert.deepEqual(getBookmarks(OTHER), [20], "other tracks are left alone");
  assert.equal(settingsRowCount(), 1);
});

test("deleting bookmarks for tracks that have none is a no-op", () => {
  addBookmark(TRACK, 10);
  deleteBookmarksForTracks([OTHER, 999]);
  assert.deepEqual(getBookmarks(TRACK), [10]);
  assert.equal(settingsRowCount(), 1);

  deleteBookmarksForTracks([]);
  assert.equal(settingsRowCount(), 1);
});
