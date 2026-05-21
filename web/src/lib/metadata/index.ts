import { ProxyAgent, fetch as undiciFetch, type Dispatcher } from "undici";
import { fetchFromDlsite } from "./dlsite";
import { fetchFromHvdb } from "./hvdb";
import type { NormalizedWork } from "./types";
import { getDlsiteProxyUrl } from "../settings";

export type { NormalizedWork } from "./types";
export { extractWorkId, coverBucket, RJ_REGEX } from "./types";

function idVariants(id: string): string[] {
  const m = id.match(/^([A-Z]+)(\d+)$/i);
  if (!m) return [id];
  const prefix = m[1].toUpperCase();
  const digits = m[2];
  const n = parseInt(digits, 10);
  const variants = new Set<string>([prefix + digits]);
  if (digits.length < 8) variants.add(prefix + digits.padStart(8, "0"));
  if (digits.length > 6) {
    const stripped = String(n);
    if (stripped.length >= 6) variants.add(prefix + stripped);
    if (stripped.length < 8 && stripped.length >= 6)
      variants.add(prefix + stripped.padStart(7, "0"));
  }
  return [...variants];
}

function getDlsiteDispatcher(): Dispatcher | undefined {
  const url = getDlsiteProxyUrl();
  if (!url) return undefined;
  try {
    return new ProxyAgent(url);
  } catch (err) {
    console.warn(`[metadata] invalid dlsite proxy url:`, err);
    return undefined;
  }
}

export async function fetchMetadata(
  id: string,
): Promise<NormalizedWork | null> {
  const variants = idVariants(id);
  const dispatcher = getDlsiteDispatcher();
  for (const variant of variants) {
    try {
      const dl = await fetchFromDlsite(variant, dispatcher);
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
    const dispatcher = url.includes("dlsite") ? getDlsiteDispatcher() : undefined;
    const res = await undiciFetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Referer: "https://www.dlsite.com/",
      },
      dispatcher,
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
