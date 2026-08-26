// Must come first — points the data dir at a temp tree before `lib/config`
// and `lib/db/client` read the environment.
import { cleanupTmp } from "../../test/env";

import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { deleteWorkProgress } from "./repository";
import { listRecentlyPlayedWorks } from "./queries";
import { sqlite } from "./client";

/**
 * Clearing a work's play progress. The interesting part is the on-deck rail:
 * it keys off a `track_progress` row merely existing, so dropping the rows is
 * the only thing that takes a work off it.
 */

beforeEach(() => {
  sqlite.pragma("foreign_keys = OFF");
  for (const t of ["track_progress", "likes", "tracks", "works", "circles"]) {
    sqlite.prepare(`DELETE FROM "${t}"`).run();
  }
  sqlite.pragma("foreign_keys = ON");
});

after(() => {
  sqlite.close();
  cleanupTmp();
});

function addWork(id: string) {
  sqlite
    .prepare(`INSERT INTO works (id, title, folder_path) VALUES (?, ?, ?)`)
    .run(id, id, `/lib/${id}`);
}

function addTrack(id: number, workId: string) {
  sqlite
    .prepare(
      `INSERT INTO tracks (id, work_id, title, relative_path, extension, size_bytes, duration_seconds, track_number)
       VALUES (?, ?, ?, ?, '.mp3', 1000, 600, ?)`,
    )
    .run(id, workId, `Track ${id}`, `track${id}.mp3`, id);
}

function addProgress(trackId: number, position: number, completed = false) {
  sqlite
    .prepare(
      `INSERT INTO track_progress (track_id, position_seconds, completed, updated_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(trackId, position, completed ? 1 : 0, 1700000000000 + trackId);
}

function progressCount(): number {
  return (
    sqlite.prepare(`SELECT count(*) AS n FROM track_progress`).get() as {
      n: number;
    }
  ).n;
}

/** Two works, each with two tracks that have been played. */
function seed() {
  addWork("RJ1");
  addWork("RJ2");
  addTrack(1, "RJ1");
  addTrack(2, "RJ1");
  addTrack(3, "RJ2");
  addProgress(1, 120);
  addProgress(2, 0, true);
  addProgress(3, 45);
}

test("drops only the target work's positions", () => {
  seed();
  assert.equal(deleteWorkProgress("RJ1"), 2);
  assert.equal(progressCount(), 1);
  const left = sqlite
    .prepare(`SELECT track_id FROM track_progress`)
    .all() as { track_id: number }[];
  assert.deepEqual(
    left.map((r) => r.track_id),
    [3],
  );
});

test("takes the work off the on-deck rail, leaving the others", () => {
  seed();
  assert.deepEqual(
    listRecentlyPlayedWorks().map((w) => w.id),
    ["RJ2", "RJ1"],
  );
  deleteWorkProgress("RJ1");
  assert.deepEqual(
    listRecentlyPlayedWorks().map((w) => w.id),
    ["RJ2"],
  );
});

test("a finished track is cleared too, not just a part-played one", () => {
  seed();
  // Track 2 is `completed`, which on-deck treats no differently from any
  // other row — so it has to go as well or the work stays on the rail.
  deleteWorkProgress("RJ1");
  assert.equal(listRecentlyPlayedWorks().some((w) => w.id === "RJ1"), false);
});

test("keeps likes", () => {
  seed();
  sqlite
    .prepare(`INSERT INTO likes (track_id, liked_at) VALUES (1, ?)`)
    .run(1700000000000);
  deleteWorkProgress("RJ1");
  const likes = sqlite.prepare(`SELECT count(*) AS n FROM likes`).get() as {
    n: number;
  };
  assert.equal(likes.n, 1);
});

test("a work with no tracks clears nothing and does not throw", () => {
  seed();
  addWork("RJ3");
  assert.equal(deleteWorkProgress("RJ3"), 0);
  assert.equal(progressCount(), 3);
});

test("an unknown work id is a no-op", () => {
  seed();
  assert.equal(deleteWorkProgress("RJ-nope"), 0);
  assert.equal(progressCount(), 3);
});
