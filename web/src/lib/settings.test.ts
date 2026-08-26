// Must come first — points the data dir at a temp tree before `lib/db/client`
// reads the environment.
import { cleanupTmp } from "../test/env";

import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { sqlite } from "./db/client";
import {
  DEFAULT_DLSITE_MIN_INTERVAL_MS,
  MAX_DLSITE_MIN_INTERVAL_MS,
  getDlsiteMinIntervalMs,
  getSettings,
  setSettings,
} from "./settings";

beforeEach(() => {
  sqlite.prepare(`DELETE FROM settings`).run();
});

after(() => {
  sqlite.close();
  cleanupTmp();
});

test("folders with no work id are left alone until asked for", () => {
  // The default decides whether an upgrade changes anything, so it is pinned.
  assert.equal(getSettings().includeUnmatchedFolders, false);

  setSettings({ includeUnmatchedFolders: true });
  assert.equal(getSettings().includeUnmatchedFolders, true);

  setSettings({ includeUnmatchedFolders: false });
  assert.equal(getSettings().includeUnmatchedFolders, false);
});

test("an unset rate limit falls back to the default, not to zero", () => {
  assert.equal(getSettings().dlsiteMinIntervalMs, DEFAULT_DLSITE_MIN_INTERVAL_MS);
  assert.equal(getDlsiteMinIntervalMs(), DEFAULT_DLSITE_MIN_INTERVAL_MS);
});

test("the rate limit round-trips", () => {
  setSettings({ dlsiteMinIntervalMs: 2500 });
  assert.equal(getSettings().dlsiteMinIntervalMs, 2500);
});

test("zero is honoured — it means no wait, not 'unset'", () => {
  setSettings({ dlsiteMinIntervalMs: 0 });
  assert.equal(getSettings().dlsiteMinIntervalMs, 0);
});

test("out-of-range values are clamped rather than rejected", () => {
  setSettings({ dlsiteMinIntervalMs: -5 });
  assert.equal(getSettings().dlsiteMinIntervalMs, 0);

  setSettings({ dlsiteMinIntervalMs: 10_000_000 });
  assert.equal(getSettings().dlsiteMinIntervalMs, MAX_DLSITE_MIN_INTERVAL_MS);
});

test("a junk value reads back as the default", () => {
  // A NaN can reach the API from an emptied number input.
  setSettings({ dlsiteMinIntervalMs: Number.NaN });
  assert.equal(getSettings().dlsiteMinIntervalMs, DEFAULT_DLSITE_MIN_INTERVAL_MS);

  sqlite
    .prepare(
      `INSERT INTO settings (key, value) VALUES ('dlsite.rateLimit.minIntervalMs', 'soon')
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run();
  assert.equal(getSettings().dlsiteMinIntervalMs, DEFAULT_DLSITE_MIN_INTERVAL_MS);
});

test("saving one field leaves the others alone", () => {
  setSettings({ dlsiteProxyUrl: "http://localhost:8888", dlsiteMinIntervalMs: 250 });
  setSettings({ coversDir: "C:\\covers" });

  const s = getSettings();
  assert.equal(s.dlsiteProxyUrl, "http://localhost:8888");
  assert.equal(s.dlsiteMinIntervalMs, 250);
  assert.equal(s.coversDir, "C:\\covers");
});
