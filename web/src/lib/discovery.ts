import "server-only";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { extractWorkId, isArchiveFile } from "./metadata/types";

/**
 * Finding the works on disk.
 *
 * One implementation, two callers: the scanner, which turns what is here into
 * rows, and backup restore, which re-homes a restored `folder_path` against
 * whatever the library looks like on this machine. They used to be separate
 * copies of the same walk, and a folder the scanner could see but restore
 * could not is a work that silently loses its path.
 */

/** Audio a track row can be made from — and what makes a folder claimable. */
export const AUDIO_EXTS = new Set([
  ".mp3",
  ".flac",
  ".wav",
  ".m4a",
  ".aac",
  ".ogg",
  ".opus",
  ".wma",
]);

/** How far below a library root a work folder is looked for. */
export const WORK_SCAN_DEPTH = 4;

/**
 * How deep `hasAudioBeneath` looks, matching the scanner's track walk. A
 * folder whose only audio sits deeper than the track pass can reach would be
 * minted as a work with no tracks in it, which is worse than not claiming it.
 */
const AUDIO_SCAN_DEPTH = 6;

/** A work as found on disk: an extracted folder, or the archive holding it. */
export interface WorkEntry {
  path: string;
  isArchive: boolean;
  /**
   * Claimed by its folder name alone — there is no work id anywhere in this
   * subtree. Its id is a hash of the path (`manualWorkId`), it is titled from
   * the folder, and nothing about it may be looked up on DLsite.
   */
  isManual?: boolean;
}

export interface Discovery {
  /** Work id -> where it was found. */
  entries: Map<string, WorkEntry>;
  /** Work id -> every path that claimed it, when more than one did. */
  duplicates: Map<string, string[]>;
}

export interface DiscoveryOptions {
  /**
   * Also claim folders that carry no work id, when they hold audio and no
   * RJ-coded work. Off by default: without it this walk behaves exactly as it
   * always has, and neither extra probe below runs at all.
   */
  includeUnmatched?: boolean;
}

export function createDiscovery(): Discovery {
  return { entries: new Map(), duplicates: new Map() };
}

/**
 * Records a discovery, letting an extracted folder win over an archive.
 *
 * A library in mid-unpack has both — the folder the user just extracted and
 * the .zip they haven't deleted yet. The folder is the one with playable
 * files, so it takes the slot regardless of which turned up first, and the
 * archive is dropped. Between two of the same kind the first still wins, so
 * root order keeps deciding duplicates; the losers are remembered so restore
 * can tell the user which one it picked.
 */
export function recordEntry(
  into: Discovery,
  id: string,
  entry: WorkEntry,
): void {
  const existing = into.entries.get(id);
  if (existing === undefined) {
    into.entries.set(id, entry);
    return;
  }
  if (existing.path === entry.path) return;
  if (existing.isArchive !== entry.isArchive) {
    if (existing.isArchive) into.entries.set(id, entry);
    return;
  }
  const seen = into.duplicates.get(id) ?? [existing.path];
  seen.push(entry.path);
  into.duplicates.set(id, seen);
}

/**
 * A stable id for a folder that has no work id of its own.
 *
 * Hashing the absolute path keeps discovery pure — no database access — and
 * the result satisfies every constraint the rest of the codebase places on a
 * work id: filesystem-safe (covers are written as a flat `${workId}${ext}`),
 * URL-path-safe (`/works/[id]`), free of the comma that `GROUP_CONCAT` splits
 * the search index on, and unable to match `RJ_REGEX`, since `j` is not a hex
 * digit.
 *
 * Renaming or moving the folder re-mints the id, so the old entry goes missing
 * and a new one appears. That is the missing-works flow, which already keeps
 * likes and progress until the user clears it in Settings.
 */
export function manualWorkId(folderPath: string): string {
  // Windows paths are case-insensitive, so the same folder reached through a
  // differently-cased root must not hash to two different works.
  const norm =
    process.platform === "win32"
      ? path.resolve(folderPath).toLowerCase()
      : path.resolve(folderPath);
  return "LOCAL-" + createHash("sha256").update(norm).digest("hex").slice(0, 12);
}

/** True for an id minted by `manualWorkId` rather than parsed off a folder. */
export function isManualWorkId(id: string): boolean {
  return id.startsWith("LOCAL-");
}

/**
 * Does this subtree hold an RJ-coded work? Records nothing.
 *
 * A pure probe on purpose. Folding this into the recursion's own return value
 * and claiming on the way back up looks equivalent and is not: every level of
 * every nested folder then independently sees "no id beneath me, audio beneath
 * me" and claims itself, which turned 8 real folders into 347.
 */
async function hasRjBeneath(dir: string, depth: number): Promise<boolean> {
  // Past the depth the walk inspects, an RJ work can still be sitting one
  // level further down, and claiming its parent would shadow it. Refusing to
  // claim an uninspected subtree is the conservative reading.
  if (depth > WORK_SCAN_DEPTH) return true;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const e of entries) {
    if (e.isFile()) {
      if (isArchiveFile(e.name) && extractWorkId(e.name)) return true;
      continue;
    }
    if (!e.isDirectory()) continue;
    if (extractWorkId(e.name)) return true;
    if (await hasRjBeneath(path.join(dir, e.name), depth + 1)) return true;
  }
  return false;
}

/** Is there anything playable under here? Early-exits on the first hit. */
async function hasAudioBeneath(dir: string, depth = 0): Promise<boolean> {
  if (depth > AUDIO_SCAN_DEPTH) return false;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  // Files first, so the common case — loose audio right here — costs one
  // readdir rather than a walk of every sibling folder.
  const dirs: string[] = [];
  for (const e of entries) {
    if (e.isFile()) {
      if (AUDIO_EXTS.has(path.extname(e.name).toLowerCase())) return true;
    } else if (e.isDirectory()) {
      dirs.push(path.join(dir, e.name));
    }
  }
  for (const d of dirs) {
    if (await hasAudioBeneath(d, depth + 1)) return true;
  }
  return false;
}

/**
 * Walks one library root, folding everything it finds into `into`.
 *
 * Returns how many distinct works this root claimed. The scanner uses that as
 * evidence the root was really readable: an unplugged drive and an emptied
 * library both come back as zero, and neither is grounds for marking the
 * library missing.
 */
export async function discoverRoot(
  root: string,
  into: Discovery,
  opts: DiscoveryOptions = {},
): Promise<number> {
  const claimed = new Set<string>();

  function record(id: string, entry: WorkEntry): void {
    claimed.add(id);
    recordEntry(into, id, entry);
  }

  async function scan(dir: string, depth: number): Promise<void> {
    if (depth > WORK_SCAN_DEPTH) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isFile()) {
        if (!isArchiveFile(e.name)) continue;
        const id = extractWorkId(e.name);
        if (id) record(id, { path: full, isArchive: true });
        continue;
      }
      if (!e.isDirectory()) continue;
      const id = extractWorkId(e.name);
      if (id) {
        record(id, { path: full, isArchive: false });
        continue;
      }
      // The shallowest folder holding audio and no work wins. Both probes are
      // skipped entirely when the setting is off, so an ordinary scan does
      // byte-for-byte what it always did.
      if (
        opts.includeUnmatched &&
        !(await hasRjBeneath(full, depth + 1)) &&
        (await hasAudioBeneath(full))
      ) {
        record(manualWorkId(full), { path: full, isArchive: false, isManual: true });
        continue; // claimed — do NOT descend, or every level claims itself too
      }
      await scan(full, depth + 1);
    }
  }

  await scan(root, 0);
  return claimed.size;
}

/** Convenience for the whole library at once, when per-root counts don't matter. */
export async function discoverWorks(
  roots: string[],
  opts: DiscoveryOptions = {},
): Promise<Discovery> {
  const discovery = createDiscovery();
  for (const root of roots) await discoverRoot(root, discovery, opts);
  return discovery;
}
