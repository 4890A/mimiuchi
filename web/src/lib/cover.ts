export function coverSrc(work: {
  id: string;
  coverUrl?: string | null;
  coverPath?: string | null;
  hasLocalCover?: boolean;
}): string {
  if (work.hasLocalCover || work.coverPath) {
    return `/api/cover/${work.id}`;
  }
  if (work.coverUrl) return work.coverUrl;
  return `/api/cover/${work.id}`;
}
