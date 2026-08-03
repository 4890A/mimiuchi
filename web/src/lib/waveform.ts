import "server-only";
import { spawn } from "node:child_process";

/**
 * Loudness-envelope extraction for the waveform seek bar.
 *
 * ffmpeg decodes the track to mono 16-bit PCM at a low sample rate and streams
 * it over stdout; we never hold the decoded audio in memory. Samples are
 * folded into short fixed-length frames, then those frames are averaged down
 * to a fixed bucket count so a 40-second track and a 4-hour track both end up
 * as the same small array.
 */

/** Bump when the extraction below changes so cached rows are regenerated. */
export const WAVEFORM_VERSION = 1;

/** Bytes stored (and served) per track. Plenty for any realistic bar width. */
export const WAVEFORM_BUCKETS = 1024;

/**
 * Decode rate. Low enough to keep the pipe cheap (~58 MB for an hour) while
 * still covering the speech band that carries most of the perceived level.
 */
const SAMPLE_RATE = 8000;

/** Samples per analysis frame — 10 ms, so bucket edges land within a frame. */
const FRAME_SAMPLES = SAMPLE_RATE / 100;

const FULL_SCALE = 32768;

/** Give up on a single file rather than leaving an ffmpeg process wedged. */
const TIMEOUT_MS = 15 * 60 * 1000;

export class FfmpegUnavailableError extends Error {
  constructor() {
    super(
      "ffmpeg was not found on PATH — install ffmpeg to use the waveform seek bar",
    );
    this.name = "FfmpegUnavailableError";
  }
}

function ffmpegBin(): string {
  return process.env.KIKOERU_FFMPEG_PATH?.trim() || "ffmpeg";
}

/**
 * Runs ffmpeg over `filePath` and returns one byte per bucket.
 *
 * Each byte is `round(255 * sqrt(rms / FULL_SCALE))`: sqrt-companding keeps
 * quiet passages from collapsing into the bottom couple of byte values, and
 * the client squares it back before shaping for display.
 */
export async function extractWaveform(
  filePath: string,
  buckets: number = WAVEFORM_BUCKETS,
): Promise<Uint8Array> {
  const frames = await decodeFrameLevels(filePath);
  return resampleToBuckets(frames, buckets);
}

/** Mean-square energy per 10 ms frame, in units of FULL_SCALE². */
function decodeFrameLevels(filePath: string): Promise<Float64Array> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      ffmpegBin(),
      [
        "-hide_banner",
        "-nostdin",
        "-loglevel",
        "error",
        "-i",
        filePath,
        // Cover art rides along as a video stream in most tagged files.
        "-vn",
        "-ac",
        "1",
        "-ar",
        String(SAMPLE_RATE),
        "-acodec",
        "pcm_s16le",
        "-f",
        "s16le",
        "-",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    let levels: number[] = [];
    let frameSum = 0;
    let frameCount = 0;
    // A chunk boundary can fall between the two bytes of a sample.
    let pending = -1;
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`ffmpeg timed out after ${TIMEOUT_MS}ms: ${filePath}`));
    }, TIMEOUT_MS);

    function finish(err: Error | null, value?: Float64Array) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(value!);
    }

    function addSample(sample: number) {
      frameSum += sample * sample;
      frameCount++;
      if (frameCount === FRAME_SAMPLES) {
        levels.push(frameSum / frameCount);
        frameSum = 0;
        frameCount = 0;
      }
    }

    child.stdout.on("data", (chunk: Buffer) => {
      let offset = 0;
      if (pending >= 0) {
        // `pending` is the low byte; this chunk starts with the signed high byte.
        addSample((chunk.readInt8(0) << 8) | pending);
        pending = -1;
        offset = 1;
      }
      const end = chunk.length - ((chunk.length - offset) % 2);
      for (let i = offset; i < end; i += 2) {
        addSample(chunk.readInt16LE(i));
      }
      if (end < chunk.length) pending = chunk[end];
    });

    child.stderr.on("data", (chunk: Buffer) => {
      // Keep the tail only; a broken file can produce a lot of noise.
      stderr = (stderr + chunk.toString()).slice(-2000);
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") finish(new FfmpegUnavailableError());
      else finish(err);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        finish(
          new Error(
            `ffmpeg exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`,
          ),
        );
        return;
      }
      // Flush a trailing partial frame so short tracks aren't dropped entirely.
      if (frameCount > 0) levels.push(frameSum / frameCount);
      if (levels.length === 0) {
        finish(new Error(`ffmpeg produced no audio samples for ${filePath}`));
        return;
      }
      const out = Float64Array.from(levels);
      levels = [];
      finish(null, out);
    });
  });
}

function resampleToBuckets(
  frames: Float64Array,
  buckets: number,
): Uint8Array {
  const out = new Uint8Array(buckets);
  const n = frames.length;

  for (let i = 0; i < buckets; i++) {
    let start = Math.floor((i * n) / buckets);
    let end = Math.floor(((i + 1) * n) / buckets);
    // Tracks shorter than `buckets` frames map several buckets onto one frame.
    if (end <= start) {
      start = Math.min(start, n - 1);
      end = start + 1;
    }

    let sum = 0;
    for (let j = start; j < end; j++) sum += frames[j];
    const rms = Math.sqrt(sum / (end - start));

    const companded = Math.sqrt(Math.min(1, rms / FULL_SCALE));
    out[i] = Math.max(0, Math.min(255, Math.round(companded * 255)));
  }

  return out;
}
