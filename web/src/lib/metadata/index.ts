import { fetchFromDlsite } from "./dlsite";
import { fetchFromHvdb } from "./hvdb";
import type { NormalizedWork } from "./types";

export type { NormalizedWork } from "./types";
export { extractWorkId, coverBucket, RJ_REGEX } from "./types";

function idVariants(id: string): string[] {
  const m = id.match(/^([A-Z]+)(\d+)$/i);
  if (!m) return [id];
  const prefix = m[1].toUpperCase();
  const digits = m[2];
  const n = parseInt(digits, 10);
  const variants = new Set<string>([prefix + digits]);
  // DLsite migrated 7-digit RJ codes to 8-digit zero-padded form.
  // Try both directions so we find the work regardless of which form the folder uses.
  if (digits.length < 8) variants.add(prefix + digits.padStart(8, "0"));
  if (digits.length > 6) {
    const stripped = String(n);
    if (stripped.length >= 6) variants.add(prefix + stripped);
    if (stripped.length < 8 && stripped.length >= 6)
      variants.add(prefix + stripped.padStart(7, "0"));
  }
  return [...variants];
}

export async function fetchMetadata(
  id: string,
): Promise<NormalizedWork | null> {
  const variants = idVariants(id);
  for (const variant of variants) {
    try {
      const dl = await fetchFromDlsite(variant);
      if (dl && dl.title) return { ...dl, id };
    } catch (err) {
      console.warn(`[metadata] DLsite fetch failed for ${variant}:`, err);
    }
  }
  for (const variant of variants) {
    try {
      const hv = await fetchFromHvdb(variant);
      if (hv && hv.title) return { ...hv, id };
    } catch (err) {
      console.warn(`[metadata] HVDB fetch failed for ${variant}:`, err);
    }
  }
  return null;
}

export async function downloadCover(
  url: string,
  destPath: string,
): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Referer: "https://www.dlsite.com/",
      },
      cache: "no-store",
    });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.writeFile(destPath, buf);
    return true;
  } catch (err) {
    console.warn(`[metadata] cover download failed:`, err);
    return false;
  }
}
