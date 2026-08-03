"use client";

/**
 * Client-side loading and caching for track waveforms.
 *
 * The server generates a track's envelope once and stores it, but the first
 * request for a long file still costs an ffmpeg decode. Peaks are kept in a
 * module-level cache so revisiting a track in the same session is instant, and
 * `prefetchWaveform` lets the player warm the next queue entry while the
 * current one plays.
 */

export type WaveformStatus = "loading" | "ready" | "unavailable";

const cache = new Map<number, Uint8Array>();
const failed = new Set<number>();
const pending = new Map<number, Promise<Uint8Array | null>>();

/** Set once the server reports ffmpeg is missing — stop asking after that. */
let ffmpegUnavailable = false;

export function getCachedWaveform(trackId: number): Uint8Array | undefined {
  return cache.get(trackId);
}

export function isWaveformUnavailable(trackId: number): boolean {
  return ffmpegUnavailable || failed.has(trackId);
}

/**
 * Deliberately not cancellable. The response is ~1 KB and the server finishes
 * and caches its ffmpeg run whether or not we are still listening, so there is
 * nothing to save by aborting — and an abort would poison the shared promise
 * below for every other caller still waiting on it. Callers that lose interest
 * just ignore the result.
 */
export function loadWaveform(trackId: number): Promise<Uint8Array | null> {
  const cached = cache.get(trackId);
  if (cached) return Promise.resolve(cached);
  if (isWaveformUnavailable(trackId)) return Promise.resolve(null);

  const inFlight = pending.get(trackId);
  if (inFlight) return inFlight;

  const job = fetch(`/api/waveform/${trackId}`)
    .then(async (res) => {
      if (res.status === 501) {
        ffmpegUnavailable = true;
        return null;
      }
      if (!res.ok) {
        // A server-side rejection (missing file, ffmpeg error) is deterministic
        // for this track — don't ask again this session.
        failed.add(trackId);
        return null;
      }
      const peaks = new Uint8Array(await res.arrayBuffer());
      if (peaks.length === 0) {
        failed.add(trackId);
        return null;
      }
      cache.set(trackId, peaks);
      return peaks;
    })
    .catch(() => {
      // Network-level failure (server restart, offline). Not the track's
      // fault, so leave it retryable rather than blacklisting it.
      return null;
    })
    .finally(() => {
      pending.delete(trackId);
    });

  pending.set(trackId, job);
  return job;
}

/** Fire-and-forget warm-up, used for the next track in the queue. */
export function prefetchWaveform(trackId: number): void {
  if (cache.has(trackId) || pending.has(trackId)) return;
  if (isWaveformUnavailable(trackId)) return;
  void loadWaveform(trackId);
}

/**
 * Display curve, applied to the loudness ratio of each bucket.
 *
 * Stored bytes are `255 * sqrt(rms / fullScale)` — sqrt-companded so quiet
 * passages survive quantisation to a byte. Drawing that directly makes every
 * track look like a solid block, because the companding lifts the whole
 * bottom half of the range. Squaring undoes it (exponent 2.0 = true
 * amplitude); 1.6 lands just short of that, keeping pauses clearly readable
 * while leaving a little more shape in the quiet parts than linear would.
 */
const DISPLAY_GAMMA = 1.6;

/**
 * Turns stored bytes into 0..1 bar heights.
 *
 * Normalising against a high percentile rather than the absolute maximum keeps
 * one stray transient from flattening the whole track — quiet recordings still
 * use the full height of the bar.
 */
export function normalizePeaks(peaks: Uint8Array): Float32Array {
  const sorted = Uint8Array.from(peaks).sort();
  const p98 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.98))];
  const reference = Math.max(p98, 1);

  const out = new Float32Array(peaks.length);
  for (let i = 0; i < peaks.length; i++) {
    out[i] = Math.min(1, (peaks[i] / reference) ** DISPLAY_GAMMA);
  }
  return out;
}

/** Reduces the envelope to exactly `count` bars, keeping each range's peak. */
export function resampleForBars(
  values: Float32Array,
  count: number,
): Float32Array {
  const out = new Float32Array(count);
  const n = values.length;
  if (n === 0 || count === 0) return out;

  for (let i = 0; i < count; i++) {
    let start = Math.floor((i * n) / count);
    let end = Math.floor(((i + 1) * n) / count);
    if (end <= start) {
      start = Math.min(start, n - 1);
      end = start + 1;
    }
    let max = 0;
    for (let j = start; j < end; j++) {
      if (values[j] > max) max = values[j];
    }
    out[i] = max;
  }
  return out;
}
