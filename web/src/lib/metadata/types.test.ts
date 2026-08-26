import { test } from "node:test";
import assert from "node:assert/strict";
import { extractWorkId, coverBucket, RJ_REGEX } from "./types";

/**
 * Pure helpers, no I/O. These two decide which folders become works and where
 * cover art is fetched from, so their edge cases are worth pinning down.
 */

// ---------------------------------------------------------------------------
// extractWorkId
// ---------------------------------------------------------------------------

test("pulls a work id out of a folder name", () => {
  assert.equal(extractWorkId("RJ01678210"), "RJ01678210");
  assert.equal(extractWorkId("[Yostar] RJ01678210 セイアASMR"), "RJ01678210");
  assert.equal(extractWorkId("RJ01678210 - title"), "RJ01678210");
  assert.equal(extractWorkId("(2026-07-27) RJ236823"), "RJ236823");
});

test("accepts every id prefix, case-insensitively", () => {
  assert.equal(extractWorkId("rj236823"), "RJ236823");
  assert.equal(extractWorkId("vj012345"), "VJ012345");
  assert.equal(extractWorkId("Bj987654"), "BJ987654");
});

test("requires 6 to 8 digits", () => {
  assert.equal(extractWorkId("RJ12345"), null, "5 digits is too few");
  assert.equal(extractWorkId("RJ123456"), "RJ123456");
  assert.equal(extractWorkId("RJ12345678"), "RJ12345678");
  assert.equal(extractWorkId("RJ123456789"), null, "9 digits is too many");
});

test("requires a word boundary so ids are not found mid-token", () => {
  assert.equal(extractWorkId("xRJ123456"), null);
  assert.equal(extractWorkId("ARJ123456"), null);
  // A separator is a boundary, so these do match.
  assert.equal(extractWorkId("x-RJ123456"), "RJ123456");
  assert.equal(extractWorkId("[RJ123456]"), "RJ123456");
});

test("an underscore is a separator, not part of the token", () => {
  // `_` is a word character, so a `\b`-anchored pattern refuses both of these.
  // DLsite's own downloader names folders the first way, and a hundred real
  // works in the wild look like it.
  assert.equal(extractWorkId("RJ01124146_MP3V0"), "RJ01124146");
  assert.equal(extractWorkId("耳フェラ。_RJ191210"), "RJ191210");
  assert.equal(extractWorkId("RJ265818_MP3V0"), "RJ265818");
});

test("a non-ASCII neighbour is a boundary too", () => {
  assert.equal(extractWorkId("【RJ236823】"), "RJ236823");
  assert.equal(extractWorkId("作品RJ236823"), "RJ236823");
});

test("returns null when there is no id", () => {
  assert.equal(extractWorkId(""), null);
  assert.equal(extractWorkId("Some Circle - Album"), null);
  assert.equal(extractWorkId("RJ"), null);
});

test("takes the first id when a name contains several", () => {
  assert.equal(extractWorkId("RJ111111 and RJ222222"), "RJ111111");
});

test("RJ_REGEX itself is not global, so it is safe to reuse", () => {
  // A /g regex would carry lastIndex between calls and match every other time.
  assert.equal(RJ_REGEX.global, false);
  assert.ok(RJ_REGEX.test("RJ123456"));
  assert.ok(RJ_REGEX.test("RJ123456"));
});

// ---------------------------------------------------------------------------
// coverBucket
// ---------------------------------------------------------------------------

test("rounds an id up to its thousand bucket, keeping the digit width", () => {
  // The real RJ01678210 cover lives under RJ01679000.
  assert.equal(coverBucket("RJ01678210"), "RJ01679000");
  assert.equal(coverBucket("RJ236823"), "RJ237000");
  assert.equal(coverBucket("VJ000001"), "VJ001000");
});

test("an exact multiple of 1000 buckets to itself", () => {
  assert.equal(coverBucket("RJ01679000"), "RJ01679000");
  assert.equal(coverBucket("RJ237000"), "RJ237000");
});

test("returns the input unchanged when it is not a prefixed number", () => {
  assert.equal(coverBucket("not-an-id"), "not-an-id");
  assert.equal(coverBucket("RJ01678210x"), "RJ01678210x");
  assert.equal(coverBucket(""), "");
});
