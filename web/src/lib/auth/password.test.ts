import { cleanupTmp, dataDir } from "../../test/env"; // must be first
import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  PasswordAlreadySetError,
  createPassword,
  passwordSource,
  passwordVersion,
  replacePassword,
  setupNeeded,
  verifyPassword,
} from "./password";

const file = path.join(dataDir, "password");

beforeEach(() => {
  delete process.env.KIKOERU_PASSWORD;
  fs.rmSync(file, { force: true });
});

after(cleanupTmp);

test("with no env var and no file, setup is needed and nothing verifies", () => {
  assert.equal(passwordSource(), "unset");
  assert.equal(setupNeeded(), true);
  // The old silent default must not come back.
  assert.equal(verifyPassword("changeme"), false);
  assert.equal(verifyPassword(""), false);
});

test("a created password is stored hashed and verifies", () => {
  createPassword("hunter22");
  assert.equal(passwordSource(), "stored");
  assert.equal(setupNeeded(), false);
  assert.equal(verifyPassword("hunter22"), true);
  assert.equal(verifyPassword("hunter2"), false);
  const stored = fs.readFileSync(file, "utf8");
  assert.ok(stored.startsWith("scrypt$"));
  assert.ok(!stored.includes("hunter22"));
});

test("setup cannot run twice: a second create is refused", () => {
  createPassword("first");
  assert.throws(() => createPassword("second"), PasswordAlreadySetError);
  assert.equal(verifyPassword("first"), true);
  assert.equal(verifyPassword("second"), false);
});

test("the env var wins over a stored password and blocks create", () => {
  createPassword("stored-one");
  process.env.KIKOERU_PASSWORD = "from-env";
  assert.equal(passwordSource(), "env");
  assert.equal(verifyPassword("from-env"), true);
  assert.equal(verifyPassword("stored-one"), false);
  assert.equal(passwordVersion(), null);
  fs.rmSync(file);
  assert.throws(() => createPassword("x"), PasswordAlreadySetError);
});

test("replacing the password changes its version, signing old sessions out", () => {
  createPassword("old-pass");
  const before = passwordVersion();
  assert.ok(before);
  replacePassword("new-pass");
  assert.notEqual(passwordVersion(), before);
  assert.equal(verifyPassword("new-pass"), true);
  assert.equal(verifyPassword("old-pass"), false);
});

test("deleting the file is the reset: setup is needed again", () => {
  createPassword("forgotten");
  fs.rmSync(file);
  assert.equal(setupNeeded(), true);
  assert.equal(passwordVersion(), null);
});
