import { ProxyAgent, fetch as undiciFetch, type Dispatcher } from "undici";
import { REQUEST_TIMEOUT_MS, fetchFromDlsite, type RetryInfo } from "./dlsite";
import { setDlsiteMinInterval, throttled } from "./throttle";
import type { NormalizedWork } from "./types";
import { getDlsiteMinIntervalMs, getDlsiteProxyUrl } from "../settings";

export type { NormalizedWork } from "./types";
export { extractWorkId, coverBucket, RJ_REGEX } from "./types";
export { DlsiteUnavailableError, type RetryInfo } from "./dlsite";

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

export interface FetchMetadataOptions {
  /** Called before each backoff wait, so a scan can log rather than look hung. */
  onRetry?: (info: RetryInfo) => void;
  /** First backoff step; doubles from there. Overridden only by tests. */
  baseDelayMs?: number;
}

/**
 * Looks a work up on DLsite, trying the id spellings DLsite has used over the
 * years until one resolves.
 *
 * Throws `DlsiteUnavailableError` if DLsite stops answering. That propagates
 * on purpose: replaying the remaining variants against a server that is
 * already refusing us is exactly the request amplification worth avoiding.
 */
export async function fetchMetadata(
  id: string,
  opts: FetchMetadataOptions = {},
): Promise<NormalizedWork | null> {
  setDlsiteMinInterval(getDlsiteMinIntervalMs());
  const variants = idVariants(id);
  const dispatcher = getDlsiteDispatcher();
  for (const variant of variants) {
    const dl = await fetchFromDlsite(variant, {
      dispatcher,
      onRetry: opts.onRetry,
      baseDelayMs: opts.baseDelayMs,
    });
    if (dl && dl.title) return { ...dl, id };
  }
  return null;
}

export async function downloadCover(
  url: string,
  destPath: string,
): Promise<boolean> {
  try {
    const isDlsite = url.includes("dlsite");
    const dispatcher = isDlsite ? getDlsiteDispatcher() : undefined;
    if (isDlsite) setDlsiteMinInterval(getDlsiteMinIntervalMs());
    const run = () =>
      undiciFetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          Referer: "https://www.dlsite.com/",
        },
        dispatcher,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    // Covers come from img.dlsite.jp — same operator, same queue.
    const res = isDlsite ? await throttled(run) : await run();
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.writeFile(destPath, buf);
    return true;
  } catch (err) {
    // A missing cover is not worth failing a scan over.
    console.warn(`[metadata] cover download failed:`, err);
    return false;
  }
}
