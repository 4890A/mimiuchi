import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tracks, works } from "@/lib/db/schema";
import { fileStream } from "@/lib/file-stream";
import { ensureTranscode, isTranscodable } from "@/lib/transcode";

const MIME: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".flac": "audio/flac",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".wma": "audio/x-ms-wma",
};

export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/audio/[trackId]">,
) {
  const { trackId } = await ctx.params;
  const id = parseInt(trackId, 10);
  if (!Number.isFinite(id)) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const row = db
    .select({
      relativePath: tracks.relativePath,
      extension: tracks.extension,
      folderPath: works.folderPath,
    })
    .from(tracks)
    .innerJoin(works, eq(tracks.workId, works.id))
    .where(eq(tracks.id, id))
    .get();

  if (!row) return new NextResponse("Not found", { status: 404 });

  const filePath = path.join(row.folderPath, row.relativePath);
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(filePath);
  } catch {
    return new NextResponse("File missing on disk", { status: 410 });
  }

  let servePath = filePath;
  let contentType = MIME[row.extension.toLowerCase()] ?? "application/octet-stream";
  let size = stat.size;

  // `?t=1` asks for the small copy; the server decides whether this track's
  // format is actually worth converting. Anything that goes wrong — no ffmpeg,
  // a broken file, a timeout — falls through to the original, because a failed
  // transcode must never cost the user playback.
  if (req.nextUrl.searchParams.get("t") === "1" && isTranscodable(row.extension)) {
    try {
      const mp3 = await ensureTranscode(id, filePath, stat.size);
      servePath = mp3;
      contentType = "audio/mpeg";
      size = (await fs.promises.stat(mp3)).size;
    } catch {}
  }

  const range = req.headers.get("range");

  if (!range) {
    const stream = fs.createReadStream(servePath);
    return new NextResponse(fileStream(stream, req.signal), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(size),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  const m = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!m) return new NextResponse("Bad range", { status: 416 });
  let start = m[1] ? parseInt(m[1], 10) : 0;
  let end = m[2] ? parseInt(m[2], 10) : size - 1;
  if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= size) {
    return new NextResponse("Range not satisfiable", {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  }
  const chunkSize = end - start + 1;
  const stream = fs.createReadStream(servePath, { start, end });
  return new NextResponse(fileStream(stream, req.signal), {
    status: 206,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(chunkSize),
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
