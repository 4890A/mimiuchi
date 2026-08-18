import { fetch as undiciFetch, type Dispatcher, type Response } from "undici";
import { throttled } from "./throttle";
import { coverBucket, type NormalizedWork } from "./types";

const ANNOUNCE_URL = (id: string) =>
  `https://www.dlsite.com/maniax/api/=/product.json?workno=${id}`;

const PRODUCT_URL = (id: string) =>
  `https://www.dlsite.com/maniax/work/=/product_id/${id}.html`;

const COMMON_HEADERS: HeadersInit = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept-Language": "ja-JP,ja;q=0.9,en;q=0.5",
  Cookie: "adultchecked=1; locale=ja-jp",
};

/** How long a single attempt may hang before it counts as a failure. */
export const REQUEST_TIMEOUT_MS = 15_000;
export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_BASE_DELAY_MS = 1_000;
/** Ceiling for a computed backoff *and* for an outsized `Retry-After`. */
const MAX_DELAY_MS = 60_000;

/**
 * DLsite is up but not answering usefully — a 429, a 5xx, or a dead socket —
 * and the attempts ran out.
 *
 * Distinct from a `null` return, which is the settled answer "this work is not
 * on DLsite". Callers treat the two very differently: a null moves on to the
 * next id variant, this aborts.
 */
export class DlsiteUnavailableError extends Error {
  readonly status?: number;
  readonly attempts: number;

  constructor(message: string, opts: { status?: number; attempts: number }) {
    super(message);
    this.name = "DlsiteUnavailableError";
    this.status = opts.status;
    this.attempts = opts.attempts;
  }
}

export interface RetryInfo {
  /** The attempt that just failed, 1-based. */
  attempt: number;
  /** How long we are about to wait before the next one. */
  delayMs: number;
  reason: string;
}

export interface DlsiteFetchOptions {
  dispatcher?: Dispatcher;
  maxAttempts?: number;
  baseDelayMs?: number;
  /** Injectable so retry tests don't actually wait. */
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (info: RetryInfo) => void;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 429 and 408 are explicit "later"; 5xx is DLsite having a moment. */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}

/**
 * `Retry-After` is either a delay in seconds or an HTTP-date. When DLsite
 * bothers to say when to come back, that beats our own guess.
 */
function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(header);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - Date.now());
}

function backoffDelay(attempt: number, baseDelayMs: number): number {
  return Math.min(baseDelayMs * 2 ** (attempt - 1), MAX_DELAY_MS);
}

/**
 * One gated request with retries. Returns the response for the caller to
 * parse, or throws `DlsiteUnavailableError` once the attempts are spent.
 *
 * A non-retryable status (a 404, say) comes back as a response — deciding what
 * a 404 *means* is the caller's job, not this function's.
 */
async function fetchWithRetry(
  url: string,
  opts: DlsiteFetchOptions,
): Promise<Response> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const sleep = opts.sleep ?? defaultSleep;

  let lastStatus: number | undefined;
  let lastReason = "unknown";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: Response | undefined;
    try {
      res = await throttled(() =>
        undiciFetch(url, {
          headers: COMMON_HEADERS,
          dispatcher: opts.dispatcher,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        }),
      );
      if (!isRetryableStatus(res.status)) return res;
      lastStatus = res.status;
      lastReason = `HTTP ${res.status}`;
      // Undici keeps the connection alive until the body is read or dumped.
      await res.body?.cancel().catch(() => {});
    } catch (err) {
      lastStatus = undefined;
      lastReason = err instanceof Error ? err.message : String(err);
    }

    if (attempt === maxAttempts) break;

    const delayMs =
      (res && parseRetryAfter(res.headers.get("retry-after"))) ??
      backoffDelay(attempt, baseDelayMs);
    const capped = Math.min(delayMs, MAX_DELAY_MS);
    opts.onRetry?.({ attempt, delayMs: capped, reason: lastReason });
    await sleep(capped);
  }

  throw new DlsiteUnavailableError(
    `DLsite did not answer after ${maxAttempts} attempts (${lastReason})`,
    { status: lastStatus, attempts: maxAttempts },
  );
}

interface DlsiteRawWork {
  workno: string;
  work_name: string;
  work_name_kana?: string;
  maker_name?: string;
  maker_name_en?: string;
  maker_id?: string;
  regist_date?: string;
  age_category?: number;
  age_category_string?: string;
  work_type?: string;
  work_type_string?: string;
  intro_s?: string;
  intro?: string;
  options?: string;
  image_main?: { url?: string; relative_url?: string };
  image_thum?: { url?: string; relative_url?: string };
  image_samples?: Array<{ url?: string; relative_url?: string }>;
  genres?: Array<{ name?: string; name_en?: string; id?: number }>;
  creaters?: {
    voice_by?: Array<{ name?: string; name_en?: string; id?: string }>;
    scenario?: Array<{ name?: string; name_en?: string; id?: string }>;
    illust?: Array<{ name?: string; name_en?: string; id?: string }>;
    music?: Array<{ name?: string; name_en?: string; id?: string }>;
    others_by?: Array<{ name?: string; name_en?: string; id?: string }>;
  };
  language_editions?: Array<{ lang?: string; label?: string }>;
  default_point_rate?: number;
}

function fixUrl(u?: string): string | undefined {
  if (!u) return undefined;
  if (u.startsWith("//")) return "https:" + u;
  if (u.startsWith("http")) return u;
  return u;
}

function classifyAge(raw?: number): NormalizedWork["ageRating"] {
  switch (raw) {
    case 1:
      return "all";
    case 2:
      return "r15";
    case 3:
      return "adult";
    default:
      return undefined;
  }
}

function fallbackCoverUrl(id: string): string {
  const bucket = coverBucket(id);
  return `https://img.dlsite.jp/modpub/images2/work/doujin/${bucket}/${id}_img_main.jpg`;
}

/**
 * Fetches one work from the announce API.
 *
 * `null` means DLsite answered and has no such work — a settled no, worth no
 * retries. A `DlsiteUnavailableError` means DLsite never gave a usable answer.
 */
export async function fetchFromDlsite(
  id: string,
  opts: DlsiteFetchOptions = {},
): Promise<NormalizedWork | null> {
  const res = await fetchWithRetry(ANNOUNCE_URL(id), opts);
  if (!res.ok) return null;
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data) || data.length === 0) return null;

  const w = data[0] as DlsiteRawWork;
  if (!w?.workno) return null;

  const voiceActors =
    w.creaters?.voice_by?.map((c) => ({
      name: (c.name ?? "").trim(),
      nameEn: c.name_en?.trim() || undefined,
    })).filter((c) => c.name) ?? [];

  const tags =
    w.genres?.map((g) => ({
      name: (g.name ?? "").trim(),
      nameEn: g.name_en?.trim() || undefined,
    })).filter((t) => t.name) ?? [];

  const coverUrl =
    fixUrl(w.image_main?.url ?? w.image_main?.relative_url) ??
    fallbackCoverUrl(id);
  const coverThumbUrl = fixUrl(
    w.image_thum?.url ?? w.image_thum?.relative_url,
  );

  return {
    id: w.workno,
    title: w.work_name,
    titleKana: w.work_name_kana || undefined,
    circleName: w.maker_name || undefined,
    circleNameEn: w.maker_name_en || undefined,
    releaseDate: w.regist_date?.slice(0, 10),
    ageRating: classifyAge(w.age_category),
    workType: w.work_type_string || w.work_type || undefined,
    description: w.intro || w.intro_s || undefined,
    coverUrl,
    coverThumbUrl,
    dlsiteUrl: PRODUCT_URL(id),
    nsfw: w.age_category === 3,
    voiceActors,
    tags,
    source: "dlsite",
  };
}
