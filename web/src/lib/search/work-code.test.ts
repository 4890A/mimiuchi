import { test } from "node:test";
import assert from "node:assert/strict";
import { isWorkCodeQuery, workCodeForms } from "./work-code";

/**
 * The rules that make a work's id findable in the search box.
 *
 * Pure functions, no index and no database — what the index does with these is
 * add the forms to a document and switch fuzzy matching off for a query the
 * second function recognises.
 */

function forms(workId: string): string[] {
  return workCodeForms(workId).split(" ");
}

// ---------------------------------------------------------------------------
// workCodeForms — index-time
// ---------------------------------------------------------------------------

test("an eight-digit id indexes itself, its digits, and the digits unpadded", () => {
  assert.deepEqual(forms("RJ01678210").sort(), [
    "01678210",
    "1678210",
    "rj01678210",
  ]);
});

test("a six-digit id also indexes the zero-padded form DLsite answers to", () => {
  // The scanner probes both RJ236823 and RJ00236823 when it looks a work up, so
  // whichever one the user copied has to find it.
  assert.deepEqual(forms("RJ236823").sort(), [
    "00236823",
    "236823",
    "rj00236823",
    "rj236823",
  ]);
});

test("the id is folded to lower case, whichever way it was stored", () => {
  assert.deepEqual(forms("rj236823").sort(), forms("RJ236823").sort());
});

test("VJ and BJ ids are treated the same as RJ", () => {
  assert.ok(forms("VJ123456").includes("vj123456"));
  assert.ok(forms("VJ123456").includes("123456"));
  assert.ok(forms("BJ123456").includes("bj123456"));
});

test("no form is emitted twice", () => {
  for (const id of ["RJ01678210", "RJ236823", "RJ00000001", "VJ12345678"]) {
    const list = forms(id);
    assert.equal(new Set(list).size, list.length, id);
  }
});

test("an id that is all padding still yields a usable form", () => {
  // Stripping the leading zeros off "00000001" leaves "1"; stripping them off a
  // hypothetical all-zero id leaves nothing, and the empty string must not be
  // indexed as a term that matches everything.
  assert.ok(forms("RJ00000001").includes("1"));
  assert.ok(!forms("RJ00000000").includes(""));
});

test("a work with no DLsite id indexes just its own id", () => {
  // Folders with no work id are keyed by a hash of their path.
  assert.deepEqual(forms("a3f19c4b2e8d7061"), ["a3f19c4b2e8d7061"]);
});

// ---------------------------------------------------------------------------
// isWorkCodeQuery — query-time
// ---------------------------------------------------------------------------

test("a full id reads as a code", () => {
  assert.ok(isWorkCodeQuery("RJ01678210"));
  assert.ok(isWorkCodeQuery("rj236823"));
  assert.ok(isWorkCodeQuery("VJ123456"));
});

test("a partially typed id reads as a code from the prefix alone", () => {
  assert.ok(isWorkCodeQuery("rj"));
  assert.ok(isWorkCodeQuery("RJ0167"));
});

test("separators inside an id are ignored", () => {
  assert.ok(isWorkCodeQuery("RJ 01678210"));
  assert.ok(isWorkCodeQuery("RJ_01678210"));
  assert.ok(isWorkCodeQuery("rj-01678210"));
});

test("a bare number reads as a code only at id length", () => {
  assert.ok(isWorkCodeQuery("236823"), "six digits");
  assert.ok(isWorkCodeQuery("01678210"), "eight digits");
  assert.ok(!isWorkCodeQuery("12345"), "too short to be an id");
  assert.ok(!isWorkCodeQuery("123456789"), "too long to be an id");
});

test("ordinary queries are not codes", () => {
  for (const q of ["", "   ", "asmr", "太陽と月", "seia", "rj works", "bj-ok!"]) {
    assert.ok(!isWorkCodeQuery(q), JSON.stringify(q));
  }
});
