import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchFromDlsite } from "./dlsite";
import { coverBucket } from "./types";

/**
 * The one suite that really talks to DLsite.
 *
 * Everything else replays a fixture, which proves the parser but not that the
 * endpoint, headers or age gate still work. This catches the case where DLsite
 * changes something and every mocked test stays green.
 *
 * Opt in, because it is slow and fails on a plane:
 *   $env:KIKOERU_LIVE_TESTS = "1"; pnpm -C web test
 *
 * RJ01678210 is an all-ages ("general") work, deliberately, so the suite pulls
 * nothing explicit over the wire. Assertions stay loose on anything DLsite
 * might legitimately edit (title wording, tag list) and strict on the shape.
 */

const skip =
  process.env.KIKOERU_LIVE_TESTS === "1"
    ? false
    : "set KIKOERU_LIVE_TESTS=1 to run tests that hit the network";

const WORK_ID = "RJ01678210";
const TIMEOUT = 30_000;

test("fetches RJ01678210 from the live API", { skip, timeout: TIMEOUT }, async () => {
  const work = await fetchFromDlsite(WORK_ID);
  assert.ok(work, "DLsite returned nothing — endpoint or headers may have changed");

  assert.equal(work.id, WORK_ID);
  assert.equal(work.source, "dlsite");

  assert.ok(work.title.length > 0, "title should not be empty");
  assert.match(work.title, /セイア/, "expected the known title to still contain セイア");
  assert.equal(work.circleName, "Yostar");

  // Still an all-ages work; if this ever flips, pick a different fixture work
  // rather than loosening the assertion.
  assert.equal(work.ageRating, "all");
  assert.equal(work.nsfw, false);

  assert.match(work.releaseDate ?? "", /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(work.voiceActors.length > 0, "expected at least one performer");
  assert.ok(work.tags.length > 0, "expected at least one genre tag");

  // The age gate is what unlocks the full record; a partial response here
  // means the cookie stopped being honoured.
  assert.ok(work.titleKana, "no kana title — the age-gate cookie may be ignored");
});

test("the cover URL it builds is actually fetchable", { skip, timeout: TIMEOUT }, async () => {
  const work = await fetchFromDlsite(WORK_ID);
  assert.ok(work?.coverUrl);
  assert.match(work.coverUrl, /^https:\/\//, "must be absolute, not protocol-relative");

  // The bucket helper has to agree with where DLsite really files the image.
  assert.ok(
    work.coverUrl.includes(coverBucket(WORK_ID)),
    `cover URL ${work.coverUrl} is not under bucket ${coverBucket(WORK_ID)}`,
  );

  const res = await fetch(work.coverUrl, {
    headers: { Referer: "https://www.dlsite.com/" },
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /^image\//);
  assert.ok((await res.arrayBuffer()).byteLength > 1000, "cover looks empty");
});

test("an unknown work id comes back as null", { skip, timeout: TIMEOUT }, async () => {
  assert.equal(await fetchFromDlsite("RJ99999999"), null);
});
