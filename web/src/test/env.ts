import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Throwaway data/covers/library directories for a test file.
 *
 * `lib/config` and `lib/db/client` read the environment exactly once, at module
 * load, so this has to run *before* anything pulls those in. Importing this
 * module has that side effect, which is why it must be the FIRST import in any
 * test that touches the database or the config. ES modules are evaluated in
 * import order, so a static import placed at the top is enough — no dynamic
 * `await import()` dance required.
 *
 *   import { tmpRoot, dataDir } from "../test/env"; // must come first
 *   import { getBookmarks } from "./bookmarks";
 *
 * Node's test runner gives every test file its own process, so each file gets
 * its own SQLite database and can wipe it freely without coordinating.
 */

export const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kikoeru-test-"));
export const dataDir = path.join(tmpRoot, "data");
export const coversDir = path.join(tmpRoot, "covers");
export const libraryRoot = path.join(tmpRoot, "media");

for (const dir of [dataDir, coversDir, libraryRoot]) {
  fs.mkdirSync(dir, { recursive: true });
}

process.env.KIKOERU_DATA_DIR = dataDir;
process.env.KIKOERU_COVERS_DIR = coversDir;
process.env.KIKOERU_LIBRARY_ROOT = libraryRoot;
// Pinned so `lib/config` doesn't generate and persist a random secret per run.
process.env.KIKOERU_SESSION_SECRET = "test-secret-not-used-by-these-tests";

/** Empties a directory without removing it. */
export function resetDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

/** Removes the whole temp tree. Call from `after()`. */
export function cleanupTmp(): void {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}
