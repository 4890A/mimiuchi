import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import {
  getTrackSourceFile,
  getTrackWaveform,
  setTrackWaveform,
} from "@/lib/db/repository";
import {
  extractWaveform,
  FfmpegUnavailableError,
  WAVEFORM_BUCKETS,
  WAVEFORM_VERSION,
} from "@/lib/waveform";

/**
 * Serves the cached loudness envelope for a track as raw bytes (one per
 * bucket), generating it with ffmpeg on first request.
 *
 * Decoding a long track takes seconds, so concurrent requests for the same
 * track share a single ffmpeg run instead of each spawning their own.
 */
const inFlight = new Map<number, Promise<Uint8Array>>();

function peaksResponse(peaks: Uint8Array, buckets: number) {
  // Copy into a standalone ArrayBuffer — a Buffer from better-sqlite3 may be a
  // view into a larger pooled allocation.
  const body = new Uint8Array(peaks.length);
  body.set(peaks);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(body.length),
      "X-Waveform-Buckets": String(buckets),
      "X-Waveform-Version": String(WAVEFORM_VERSION),
      // Keyed by version in the payload; a version bump changes the bytes.
      "Cache-Control": "private, max-age=604800, immutable",
    },
  });
}

async function generate(
  trackId: number,
  filePath: string,
): Promise<Uint8Array> {
  const existing = inFlight.get(trackId);
  if (existing) return existing;

  const job = extractWaveform(filePath, WAVEFORM_BUCKETS)
    .then((peaks) => {
      setTrackWaveform(
        trackId,
        WAVEFORM_VERSION,
        WAVEFORM_BUCKETS,
        Buffer.from(peaks),
      );
      return peaks;
    })
    .finally(() => {
      inFlight.delete(trackId);
    });

  inFlight.set(trackId, job);
  return job;
}

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/waveform/[trackId]">,
) {
  const { trackId } = await ctx.params;
  const id = parseInt(trackId, 10);
  if (!Number.isFinite(id)) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const cached = getTrackWaveform(id);
  if (cached && cached.version === WAVEFORM_VERSION) {
    return peaksResponse(cached.peaks, cached.buckets);
  }

  const row = getTrackSourceFile(id);
  if (!row) return new NextResponse("Not found", { status: 404 });

  const filePath = path.join(row.folderPath, row.relativePath);
  if (!fs.existsSync(filePath)) {
    return new NextResponse("File missing on disk", { status: 410 });
  }

  try {
    const peaks = await generate(id, filePath);
    return peaksResponse(peaks, WAVEFORM_BUCKETS);
  } catch (err) {
    if (err instanceof FfmpegUnavailableError) {
      // 501 tells the client to stop asking for this session.
      return new NextResponse(err.message, { status: 501 });
    }
    return new NextResponse(`Waveform failed: ${String(err)}`, { status: 500 });
  }
}
