/**
 * A minimum-interval gate for outbound DLsite requests.
 *
 * Everything that talks to dlsite.com or img.dlsite.jp queues here, so a scan
 * of a thousand works trickles out at a fixed pace instead of hammering the
 * host as fast as it can answer. Retries queue like any other request, which
 * is the point: backing off is pointless if the retry jumps the line.
 *
 * The gate is a promise chain rather than a token bucket — requests are made
 * one at a time by a sequential scanner, so the only thing worth enforcing is
 * the gap between them.
 *
 * The interval defaults to 0 (no waiting) and is pushed in from the settings
 * by `lib/metadata/index`. That keeps this module and `dlsite.ts` usable in
 * tests without a database.
 */

let minIntervalMs = 0;
let lastStartedAt = 0;
/** The tail of the queue: resolves when the request ahead of us has begun. */
let chain: Promise<void> = Promise.resolve();

export function setDlsiteMinInterval(ms: number): void {
  minIntervalMs = Number.isFinite(ms) && ms > 0 ? ms : 0;
}

export function getDlsiteMinInterval(): number {
  return minIntervalMs;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs `fn` no sooner than `minIntervalMs` after the previous gated call
 * started. Callers keep their own result and rejection; a throwing `fn` does
 * not stall the queue behind it.
 */
export function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const ready = chain.then(async () => {
    if (minIntervalMs > 0) {
      const wait = lastStartedAt + minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
    }
    lastStartedAt = Date.now();
  });
  // The next caller waits on our slot being taken, not on our request
  // finishing — and never on our failure.
  chain = ready.catch(() => {});
  return ready.then(fn);
}

/** Test hook: forgets the last request time so a fresh case starts ungated. */
export function resetDlsiteThrottle(): void {
  minIntervalMs = 0;
  lastStartedAt = 0;
  chain = Promise.resolve();
}
