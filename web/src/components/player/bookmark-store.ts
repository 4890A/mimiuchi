"use client";
import { useSyncExternalStore } from "react";
import { toast } from "sonner";

/**
 * Shared bookmark state for every track on screen.
 *
 * The player's waveform and the track list both read from here, so a bookmark
 * dropped on the waveform shows up on the corresponding row immediately —
 * without either component knowing about the other.
 *
 * Mutations apply locally first, then adopt the canonical list the server
 * returns (which has already merged near-duplicates); a failed write rolls
 * back rather than leaving a marker that isn't really saved.
 */

const EMPTY: number[] = [];

/** Replaced wholesale on every change so `useSyncExternalStore` sees a new ref. */
let snapshot: ReadonlyMap<number, number[]> = new Map();
const listeners = new Set<() => void>();
/** Track ids already fetched (or in flight), so lists don't refetch on remount. */
const requested = new Set<number>();

/** Ids per batch request, to keep the query string a sane length. */
const CHUNK = 200;

function commit(next: Map<number, number[]>) {
  snapshot = next;
  for (const listener of listeners) listener();
}

function setFor(trackId: number, positions: number[]) {
  const next = new Map(snapshot);
  next.set(trackId, positions);
  commit(next);
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function getSnapshot() {
  return snapshot;
}

/** Stable empty map — the server never has bookmarks to render. */
const SERVER_SNAPSHOT: ReadonlyMap<number, number[]> = new Map();
function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

export function useBookmarkMap(): ReadonlyMap<number, number[]> {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useTrackBookmarks(trackId: number | null): number[] {
  const map = useBookmarkMap();
  if (trackId === null) return EMPTY;
  return map.get(trackId) ?? EMPTY;
}

/** Fetches any ids not already loaded. Safe to call on every render pass. */
export function ensureBookmarksLoaded(trackIds: number[]): void {
  const missing = trackIds.filter((id) => !requested.has(id));
  if (missing.length === 0) return;
  for (const id of missing) requested.add(id);

  for (let i = 0; i < missing.length; i += CHUNK) {
    const chunk = missing.slice(i, i + CHUNK);
    void fetch(`/api/bookmarks?trackIds=${chunk.join(",")}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { bookmarks?: Record<string, number[]> } | null) => {
        if (!data?.bookmarks) return;
        const next = new Map(snapshot);
        for (const id of chunk) {
          const list = data.bookmarks[String(id)];
          next.set(id, Array.isArray(list) ? list : []);
        }
        commit(next);
      })
      .catch(() => {
        // Allow a later attempt; markers are additive so a miss is harmless.
        for (const id of chunk) requested.delete(id);
      });
  }
}

function reconcile(trackId: number, rollback: number[], promise: Promise<Response>, failureMessage: string) {
  void promise
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
    .then((data: { bookmarks?: number[] }) => {
      if (Array.isArray(data.bookmarks)) setFor(trackId, data.bookmarks);
    })
    .catch(() => {
      setFor(trackId, rollback);
      toast.error(failureMessage);
    });
}

export function addBookmark(trackId: number, positionSeconds: number): void {
  const before = snapshot.get(trackId) ?? EMPTY;
  requested.add(trackId);
  setFor(trackId, [...before, positionSeconds].sort((a, b) => a - b));

  reconcile(
    trackId,
    before,
    fetch(`/api/bookmarks/${trackId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positionSeconds }),
    }),
    "Couldn't save bookmark",
  );
}

export function removeBookmark(trackId: number, positionSeconds: number): void {
  const before = snapshot.get(trackId) ?? EMPTY;
  setFor(
    trackId,
    before.filter((b) => b !== positionSeconds),
  );

  reconcile(
    trackId,
    before,
    fetch(
      `/api/bookmarks/${trackId}?at=${encodeURIComponent(positionSeconds)}`,
      { method: "DELETE" },
    ),
    "Couldn't remove bookmark",
  );
}
