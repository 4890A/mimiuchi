import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanPathInput, parsePathList } from "./paths";

test("Explorer's Copy as path quotes are stripped", () => {
  assert.equal(cleanPathInput('"D:\\Voice works"'), "D:\\Voice works");
  assert.equal(cleanPathInput("  'D:\\a'  "), "D:\\a");
  assert.equal(cleanPathInput('" D:\\a "'), "D:\\a");
});

test("quotes inside a path, or unbalanced ones, are left alone", () => {
  assert.equal(cleanPathInput('D:\\it"s'), 'D:\\it"s');
  assert.equal(cleanPathInput('"D:\\a'), '"D:\\a');
  assert.equal(cleanPathInput('"'), '"');
});

test("a pasted list is split, cleaned and stripped of blanks", () => {
  assert.deepEqual(parsePathList('"D:\\a"\r\n\r\n  /srv/b  \n""\n'), [
    "D:\\a",
    "/srv/b",
  ]);
});
