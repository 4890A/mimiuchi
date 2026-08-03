import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "./db/client";
import { settings as settingsTable } from "./db/schema";

/**
 * Per-track bookmarks, stored as JSON in the existing `settings` key/value
 * table rather than a table of their own — one row per track that has any,
 * deleted again once the last one is removed. That keeps the feature free of
 * schema changes and migrations while still persisting server-side, so
 * bookmarks survive a cleared browser and follow the user between devices.
 */

const KEY_PREFIX = "bookmarks.track.";

/** Guards against a runaway client filling a row with thousands of entries. */
const MAX_PER_TRACK = 500;

/**
 * Two bookmarks closer than this are treated as the same one. Stops a
 * double right-click from stacking invisible duplicates, and gives `remove`
 * a tolerance so the client doesn't need bit-exact float round-tripping.
 */
const MERGE_TOLERANCE_SECONDS = 0.25;

function rowKey(trackId: number): string {
  return `${KEY_PREFIX}${trackId}`;
}

/** Milliseconds is as precise as a seek needs to be, and keeps JSON compact. */
function round(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}

function parse(raw: string | undefined): number[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0)
      .map(round)
      .sort((a, b) => a - b);
  } catch {
    // Corrupt value — behave as if the track had none rather than throwing.
    return [];
  }
}

function write(trackId: number, positions: number[]): number[] {
  const key = rowKey(trackId);
  if (positions.length === 0) {
    db.delete(settingsTable).where(eq(settingsTable.key, key)).run();
    return [];
  }
  const value = JSON.stringify(positions);
  db.insert(settingsTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value } })
    .run();
  return positions;
}

export function getBookmarks(trackId: number): number[] {
  const row = db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, rowKey(trackId)))
    .get();
  return parse(row?.value);
}

/**
 * Bookmarks for many tracks in one query, for the track list. Tracks with none
 * are present as empty arrays so the caller can tell "loaded, none" apart from
 * "not loaded yet".
 */
export function getBookmarksForTracks(
  trackIds: number[],
): Record<number, number[]> {
  const out: Record<number, number[]> = {};
  for (const id of trackIds) out[id] = [];
  if (trackIds.length === 0) return out;

  const rows = db
    .select()
    .from(settingsTable)
    .where(inArray(settingsTable.key, trackIds.map(rowKey)))
    .all();

  for (const row of rows) {
    const id = Number(row.key.slice(KEY_PREFIX.length));
    if (Number.isFinite(id)) out[id] = parse(row.value);
  }
  return out;
}

export function addBookmark(trackId: number, positionSeconds: number): number[] {
  const at = round(Math.max(0, positionSeconds));
  const existing = getBookmarks(trackId);

  const duplicate = existing.some(
    (b) => Math.abs(b - at) <= MERGE_TOLERANCE_SECONDS,
  );
  if (duplicate || existing.length >= MAX_PER_TRACK) return existing;

  return write(trackId, [...existing, at].sort((a, b) => a - b));
}

export function removeBookmark(
  trackId: number,
  positionSeconds: number,
): number[] {
  const at = round(positionSeconds);
  const existing = getBookmarks(trackId);

  // Drop only the closest match, so two bookmarks inside the tolerance of the
  // requested position don't both disappear.
  let bestIndex = -1;
  let bestDistance = Infinity;
  for (let i = 0; i < existing.length; i++) {
    const distance = Math.abs(existing[i] - at);
    if (distance <= MERGE_TOLERANCE_SECONDS && distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  if (bestIndex === -1) return existing;

  return write(
    trackId,
    existing.filter((_, i) => i !== bestIndex),
  );
}
