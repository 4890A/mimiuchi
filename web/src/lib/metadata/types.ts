export interface NormalizedWork {
  id: string;
  title: string;
  titleKana?: string;
  circleName?: string;
  circleNameEn?: string;
  releaseDate?: string;
  ageRating?: "all" | "r15" | "adult";
  language?: string;
  workType?: string;
  description?: string;
  coverUrl?: string;
  coverThumbUrl?: string;
  dlsiteUrl?: string;
  nsfw?: boolean;
  voiceActors: Array<{ name: string; nameEn?: string }>;
  tags: Array<{ name: string; nameEn?: string; category?: string }>;
  source: "dlsite" | "manual";
}

/**
 * A work id, anchored so it is never found inside a longer token.
 *
 * `\b` cannot do this job: `_` is a word character, so a trailing `\b` refuses
 * `RJ01124146_MP3V0` — the shape DLsite's own downloader produces — and a
 * leading one refuses `耳フェラ。_RJ191210`. Both are common enough that the
 * scanner was silently skipping a hundred real works.
 *
 * So: reject a preceding letter or digit, which is what `xRJ123456` and
 * `ARJ123456` need, while letting `_` and punctuation through; and reject a
 * following digit, so 9-or-more-digit strings still fail rather than matching
 * their first 8.
 */
export const RJ_REGEX = /(?<![A-Za-z0-9])(RJ|VJ|BJ)\d{6,8}(?!\d)/i;

export function extractWorkId(input: string): string | null {
  const m = input.toUpperCase().match(RJ_REGEX);
  return m ? m[0].toUpperCase() : null;
}

/**
 * Archive containers a work can still be packed in.
 *
 * DLsite downloads arrive as one of these, and a lot of libraries keep the
 * untouched archive next to (or instead of) the extracted folder. The scanner
 * indexes them so the work is visible with its metadata, even though nothing
 * inside is playable until it is extracted.
 *
 * Continuation parts of a split set (`.r00`, `.zip.001`) are not listed, and
 * do not need to be: works are keyed by id, so a set whose parts all end in a
 * listed extension still collapses to the single entry we want.
 */
export const ARCHIVE_EXTS = [".zip", ".rar", ".7z"] as const;

/** True for a filename that looks like one of the archive containers above. */
export function isArchiveFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ARCHIVE_EXTS.some((ext) => lower.endsWith(ext));
}

/** `【RJ01648943】【MP3】.zip` -> `ZIP`, for the badge on an archived work. */
export function archiveLabel(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf(".") + 1);
  return ext.toUpperCase();
}

export function coverBucket(workId: string): string {
  const m = workId.match(/^([A-Z]+)(\d+)$/);
  if (!m) return workId;
  const prefix = m[1];
  const n = parseInt(m[2], 10);
  const width = m[2].length;
  const bucket = Math.ceil(n / 1000) * 1000;
  return prefix + String(bucket).padStart(width, "0");
}
