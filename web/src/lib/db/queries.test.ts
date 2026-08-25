// Must come first — points the data dir at a temp tree before `lib/config`
// and `lib/db/client` read the environment.
import { cleanupTmp } from "../../test/env";

import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { listFacetsForWorks, listAllTags, listAllVoiceActors } from "./queries";
import { sqlite } from "./client";

/**
 * The filter menu's facet lists. Rows are seeded straight through sqlite
 * rather than the scanner, so each case is exactly the shape it is about.
 */

beforeEach(() => {
  sqlite.pragma("foreign_keys = OFF");
  for (const t of [
    "work_tags",
    "work_voice_actors",
    "works",
    "tags",
    "voice_actors",
    "circles",
  ]) {
    sqlite.prepare(`DELETE FROM "${t}"`).run();
  }
  sqlite.pragma("foreign_keys = ON");
});

after(() => {
  sqlite.close();
  cleanupTmp();
});

function addWork(id: string, opts: { circleId?: number; missing?: boolean } = {}) {
  sqlite
    .prepare(
      `INSERT INTO works (id, title, folder_path, circle_id, missing_since)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(id, id, `/lib/${id}`, opts.circleId ?? null, opts.missing ? 1 : null);
}

function addTag(id: number, name: string) {
  sqlite.prepare(`INSERT INTO tags (id, name) VALUES (?, ?)`).run(id, name);
}

function tagWork(workId: string, tagId: number) {
  sqlite
    .prepare(`INSERT INTO work_tags (work_id, tag_id) VALUES (?, ?)`)
    .run(workId, tagId);
}

function addVa(id: number, name: string) {
  sqlite.prepare(`INSERT INTO voice_actors (id, name) VALUES (?, ?)`).run(id, name);
}

function castVa(workId: string, vaId: number) {
  sqlite
    .prepare(
      `INSERT INTO work_voice_actors (work_id, voice_actor_id) VALUES (?, ?)`,
    )
    .run(workId, vaId);
}

function addCircle(id: number, name: string) {
  sqlite.prepare(`INSERT INTO circles (id, name) VALUES (?, ?)`).run(id, name);
}

const ASMR = 1;
const EARLICK = 2;
const HEALING = 3;
const UNRELATED = 4;

/** Three ASMR works with assorted extra tags, plus one with no ASMR at all. */
function seedLibrary() {
  addTag(ASMR, "ASMR");
  addTag(EARLICK, "耳舐め");
  addTag(HEALING, "癒し");
  addTag(UNRELATED, "コメディ");

  addWork("RJ1");
  addWork("RJ2");
  addWork("RJ3");
  addWork("RJ4");

  for (const w of ["RJ1", "RJ2", "RJ3"]) tagWork(w, ASMR);
  tagWork("RJ1", EARLICK);
  tagWork("RJ2", EARLICK);
  tagWork("RJ3", HEALING);
  tagWork("RJ4", UNRELATED);
}

const names = (rows: { name: string }[]) => rows.map((r) => r.name);
const countOf = (rows: { name: string; workCount: number }[], name: string) =>
  rows.find((r) => r.name === name)?.workCount;

test("with no filters the facets cover the whole library", () => {
  seedLibrary();
  const f = listFacetsForWorks(["RJ1", "RJ2", "RJ3", "RJ4"]);
  assert.deepEqual(names(f.tags).sort(), ["ASMR", "コメディ", "癒し", "耳舐め"].sort());
  assert.equal(countOf(f.tags, "ASMR"), 3);
});

test("filtering by a tag leaves only the tags its works carry", () => {
  seedLibrary();
  // The works a tags=ASMR filter would return.
  const f = listFacetsForWorks(["RJ1", "RJ2", "RJ3"]);

  assert.equal(
    names(f.tags).includes("コメディ"),
    false,
    "a tag on no remaining work is gone from the menu entirely",
  );
  assert.deepEqual(names(f.tags).sort(), ["ASMR", "癒し", "耳舐め"].sort());
});

test("counts are the co-occurrence counts, not the library-wide ones", () => {
  seedLibrary();
  assert.equal(countOf(listAllTags(), "耳舐め"), 2);

  // Narrowed to the ASMR works, 耳舐め is on two of the three.
  const f = listFacetsForWorks(["RJ1", "RJ2", "RJ3"]);
  assert.equal(countOf(f.tags, "耳舐め"), 2);
  assert.equal(countOf(f.tags, "癒し"), 1);
});

test("the selected tag stays listed, so it can be deselected", () => {
  seedLibrary();
  const f = listFacetsForWorks(["RJ1", "RJ2", "RJ3"]);
  // Present on every remaining work — which is what an AND filter guarantees.
  assert.equal(countOf(f.tags, "ASMR"), 3);
});

test("an empty result set yields empty lists rather than throwing", () => {
  seedLibrary();
  const f = listFacetsForWorks([]);
  assert.deepEqual(f, { tags: [], voiceActors: [], circles: [] });
});

test("voice actors and circles narrow the same way", () => {
  addVa(1, "種﨑敦美");
  addVa(2, "陽向葵ゅか");
  addCircle(10, "Yostar");
  addCircle(20, "別サークル");
  addWork("RJ1", { circleId: 10 });
  addWork("RJ2", { circleId: 20 });
  castVa("RJ1", 1);
  castVa("RJ2", 2);

  const f = listFacetsForWorks(["RJ1"]);
  assert.deepEqual(names(f.voiceActors), ["種﨑敦美"]);
  assert.deepEqual(names(f.circles), ["Yostar"]);
});

test("a work missing from disk is never counted", () => {
  addTag(ASMR, "ASMR");
  addVa(1, "種﨑敦美");
  addWork("RJ1");
  addWork("RJ2", { missing: true });
  tagWork("RJ1", ASMR);
  tagWork("RJ2", ASMR);
  castVa("RJ1", 1);
  castVa("RJ2", 1);

  // The global lists feed the seiyuu and circles pages, where the count shows.
  assert.equal(countOf(listAllTags(), "ASMR"), 1);
  assert.equal(countOf(listAllVoiceActors(), "種﨑敦美"), 1);

  // The facets inherit it for free: a missing work is never in the filtered set.
  assert.equal(countOf(listFacetsForWorks(["RJ1"]).tags, "ASMR"), 1);
});

test("counts merge correctly across id batches", () => {
  addTag(ASMR, "ASMR");
  // Comfortably past the 900-id batch size, so the merge path is exercised.
  const ids: string[] = [];
  const insert = sqlite.prepare(
    `INSERT INTO works (id, title, folder_path) VALUES (?, ?, ?)`,
  );
  const link = sqlite.prepare(
    `INSERT INTO work_tags (work_id, tag_id) VALUES (?, ?)`,
  );
  sqlite.transaction(() => {
    for (let i = 0; i < 2100; i++) {
      const id = `RJ${i}`;
      insert.run(id, id, `/lib/${id}`);
      link.run(id, ASMR);
      ids.push(id);
    }
  })();

  const f = listFacetsForWorks(ids);
  assert.equal(f.tags.length, 1, "batches merge into one row, not three");
  assert.equal(countOf(f.tags, "ASMR"), 2100);
});
