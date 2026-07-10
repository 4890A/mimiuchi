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
