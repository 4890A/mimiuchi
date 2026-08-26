/**
 * Is there actually an image behind `coverSrc`?
 *
 * `coverSrc` always returns a URL, and `/api/cover/<id>` 404s when the work has
 * no cover on disk — a broken `<img>`. That used to be an edge case; every
 * hand-entered work starts out coverless, so it isn't one any more. Call sites
 * that render an image branch on this and draw a placeholder tile instead.
 *
 * Deliberately separate from `coverSrc` rather than folded into its return
 * type: the player threads that string through as media-session artwork, where
 * a 404 costs nothing and a null would have to be handled everywhere.
 */
export function hasCover(work: {
  coverUrl?: string | null;
  coverPath?: string | null;
  hasLocalCover?: boolean;
}): boolean {
  return Boolean(work.hasLocalCover || work.coverPath || work.coverUrl);
}

export function coverSrc(
  work: {
    id: string;
    coverUrl?: string | null;
    coverPath?: string | null;
    hasLocalCover?: boolean;
  },
  /** Cache-busting token (e.g. cover file mtime) appended to the local
   *  cover URL so the browser refetches after an in-app cover change. */
  version?: number,
): string {
  if (work.hasLocalCover || work.coverPath) {
    const base = `/api/cover/${work.id}`;
    return version ? `${base}?v=${version}` : base;
  }
  if (work.coverUrl) return work.coverUrl;
  return `/api/cover/${work.id}`;
}
