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
  source: "dlsite" | "hvdb" | "manual";
}

export const RJ_REGEX = /\b(RJ|VJ|BJ)\d{6,8}\b/i;

export function extractWorkId(input: string): string | null {
  const m = input.toUpperCase().match(RJ_REGEX);
  return m ? m[0].toUpperCase() : null;
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
