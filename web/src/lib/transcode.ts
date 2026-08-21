import "server-only";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/lib/config";
import { FfmpegUnavailableError } from "@/lib/waveform";

/**
 * On-demand MP3 copies of tracks that are too fat to stream to a phone.
 *
 * A WAV in this library runs anywhere from 0.7 to 2.9 Mbps. A phone that drops
 * its radio into power-save when the screen goes off cannot keep that fed, and
 * because the browser's media buffer is bounded in bytes rather than seconds, a
 * high bitrate also buys fewer seconds of slack to ride out the gap. Capping at
 * 320 kbps buys back somewhere between two and nine times the buffered seconds,
 * depending on how the source was recorded.
 *
 * The result is written to a file and then served through the ordinary
 * range-request path in the audio route. That is the whole reason this is a
 * cache and not a pipe: iOS refuses to play a media URL that can't answer a
 * `Range` request with a real `206` and a `Content-Length`, and a live ffmpeg
 * stream doesn't know its own final length. Paying a one-off conversion buys a
 * plain file on disk that every platform already knows how to seek.
 *
 * The directory is capped and evicted least-recently-used, so it settles at a
 * working set rather than growing to mirror the library. Set
 * `KIKOERU_TRANSCODE_CACHE_MB` to change the ceiling, or `0` to remove it.
 * Deleting the directory at any time is safe; entries are rebuilt on demand.
 */

/**
 * The MP3 ceiling, and constant rather than variable on purpose. CBR makes byte
 * offset a linear function of time, so a player seeks exactly; VBR needs the
 * Xing TOC, which is 100 entries however long the file is — roughly 36-second
 * granularity across an hour, interpolated. Fine for a pop song, not for a
 * two-hour work with a waveform scrubber and bookmarks on it.
 */
const BITRATE = "320k";

/** Give up rather than leaving an ffmpeg process wedged on a broken file. */
const TIMEOUT_MS = 20 * 60 * 1000;

/**
 * Ceiling for the whole cache. At 320 kbps a converted track runs 25-135 MB,
 * so this holds a few dozen of the long ones and many more short — comfortably
 * past anyone's actual rotation, while staying a fraction of the library it
 * was derived from.
 */
const DEFAULT_CACHE_MB = 4096;

export const TRANSCODE_DIR = path.join(DATA_DIR, "transcodes");

/**
 * Formats worth converting. Lossy sources are already small enough that
 * re-encoding them would only lose quality, so they're served untouched.
 */
const TRANSCODABLE = new Set([".wav"]);

export function isTranscodable(extension: string): boolean {
  return TRANSCODABLE.has(extension.toLowerCase());
}

function ffmpegBin(): string {
  return process.env.KIKOERU_FFMPEG_PATH?.trim() || "ffmpeg";
}

/**
 * Keyed by source size as well as track id, so a re-ripped or replaced file
 * gets a new cache entry instead of silently playing the old audio, and by
 * bitrate, so changing `BITRATE` re-converts rather than serving whatever the
 * previous setting produced. Entries from an older bitrate are swept up by
 * `dropStaleSiblings` the first time their track is played again.
 */
function cachePath(trackId: number, sourceSize: number): string {
  return path.join(TRANSCODE_DIR, `${trackId}-${sourceSize}-${BITRATE}.mp3`);
}

/** `0` disables the ceiling entirely; anything unparseable falls back. */
function cacheLimitBytes(): number {
  const raw = process.env.KIKOERU_TRANSCODE_CACHE_MB?.trim();
  const mb = raw ? Number(raw) : DEFAULT_CACHE_MB;
  if (!Number.isFinite(mb) || mb < 0) return DEFAULT_CACHE_MB * 1024 * 1024;
  return mb * 1024 * 1024;
}

/**
 * Marks an entry as just-used, since eviction below is least-recently-used and
 * reads mtime to decide. Without this a track you play every day would age out
 * exactly as fast as one you played once.
 */
function touch(file: string): void {
  try {
    const now = new Date();
    fs.utimesSync(file, now, now);
  } catch {}
}

/**
 * Drops earlier conversions of the same track. Reaching here means the source
 * file changed size, so any sibling is of audio that no longer exists — known
 * dead now, rather than left for eviction to guess at later.
 */
function dropStaleSiblings(trackId: number, keep: string): void {
  let names: string[];
  try {
    names = fs.readdirSync(TRANSCODE_DIR);
  } catch {
    return;
  }
  const prefix = `${trackId}-`;
  for (const name of names) {
    if (!name.startsWith(prefix) || !name.endsWith(".mp3")) continue;
    const full = path.join(TRANSCODE_DIR, name);
    if (full === keep) continue;
    try {
      fs.unlinkSync(full);
    } catch {}
  }
}

/**
 * Trims the cache back under its ceiling, oldest use first.
 *
 * An entry whose track was deleted from the library is never touched again, so
 * it drifts to the front of this queue and leaves on its own — which is why
 * there are no cleanup hooks wired into work deletion or the scanner's prune.
 *
 * `keep` is the entry that was just written. Without excluding it, a ceiling
 * smaller than a single track would delete each conversion the moment it
 * finished and re-run ffmpeg on every request forever.
 */
function evict(keep: string): void {
  const limit = cacheLimitBytes();
  if (limit <= 0) return;

  let entries: { path: string; size: number; used: number }[];
  try {
    entries = fs
      .readdirSync(TRANSCODE_DIR)
      .filter((name) => name.endsWith(".mp3"))
      .map((name) => {
        const full = path.join(TRANSCODE_DIR, name);
        const stat = fs.statSync(full);
        return { path: full, size: stat.size, used: stat.mtimeMs };
      });
  } catch {
    return;
  }

  let total = entries.reduce((sum, e) => sum + e.size, 0);
  if (total <= limit) return;

  entries.sort((a, b) => a.used - b.used);
  for (const entry of entries) {
    if (total <= limit) break;
    if (entry.path === keep) continue;
    try {
      // A file still being streamed can't be unlinked on Windows; skipping it
      // is fine, the next conversion will try again.
      fs.unlinkSync(entry.path);
      total -= entry.size;
    } catch {}
  }
}

/** Concurrent requests for one track share a single ffmpeg run. */
const inFlight = new Map<string, Promise<string>>();

/**
 * Returns the path to an MP3 of `sourcePath`, converting it on first request.
 *
 * Rejects if ffmpeg is missing or the conversion fails; the caller is expected
 * to fall back to the original file rather than failing the request.
 */
export function ensureTranscode(
  trackId: number,
  sourcePath: string,
  sourceSize: number,
): Promise<string> {
  const target = cachePath(trackId, sourceSize);
  if (fs.existsSync(target)) {
    touch(target);
    return Promise.resolve(target);
  }

  const running = inFlight.get(target);
  if (running) return running;

  const job = convert(sourcePath, target)
    .then((out) => {
      dropStaleSiblings(trackId, out);
      evict(out);
      return out;
    })
    .finally(() => {
      inFlight.delete(target);
    });
  inFlight.set(target, job);
  return job;
}

function convert(sourcePath: string, target: string): Promise<string> {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(TRANSCODE_DIR, { recursive: true });
    // Written under a scratch name and renamed on success, so a crashed or
    // killed run can never leave a half-file that looks like a valid cache hit.
    const partial = `${target}.part`;

    const child = spawn(
      ffmpegBin(),
      [
        "-hide_banner",
        "-nostdin",
        "-loglevel",
        "error",
        "-y",
        "-i",
        sourcePath,
        // Cover art rides along as a video stream in most tagged files, and the
        // mp3 muxer would rather not deal with it.
        "-vn",
        "-c:a",
        "libmp3lame",
        "-b:a",
        BITRATE,
        "-f",
        "mp3",
        partial,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );

    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      cleanup(partial);
      reject(new Error(`ffmpeg timed out after ${TIMEOUT_MS}ms: ${sourcePath}`));
    }, TIMEOUT_MS);

    function finish(err: Error | null) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) {
        cleanup(partial);
        reject(err);
      } else {
        resolve(target);
      }
    }

    child.stderr.on("data", (chunk: Buffer) => {
      // Keep the tail only; a broken file can produce a lot of noise.
      stderr = (stderr + chunk.toString()).slice(-2000);
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      finish(err.code === "ENOENT" ? new FfmpegUnavailableError() : err);
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
      try {
        fs.renameSync(partial, target);
      } catch (err) {
        // Windows won't rename onto an existing name. If another run landed
        // first the cache entry is there either way, which is all we needed.
        if (!fs.existsSync(target)) {
          finish(err as Error);
          return;
        }
        cleanup(partial);
      }
      finish(null);
    });
  });
}

function cleanup(partial: string) {
  try {
    fs.unlinkSync(partial);
  } catch {}
}
