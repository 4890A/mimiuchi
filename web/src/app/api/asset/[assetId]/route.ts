import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { workAssets, works } from "@/lib/db/schema";
import { fileStream } from "@/lib/file-stream";
import { decodeTextFile } from "@/lib/assets/text";
import { ensureThumbnail, isThumbnailable } from "@/lib/assets/thumbnail";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
};

/**
 * A script big enough to exceed this is not a script. The largest 台本 in a
 * real library is ~64 KB; the cap exists so a mislabelled file cannot be
 * pulled into memory whole.
 */
const MAX_TEXT_BYTES = 4 * 1024 * 1024;

export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/asset/[assetId]">,
) {
  const { assetId } = await ctx.params;
  const id = parseInt(assetId, 10);
  if (!Number.isFinite(id)) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const row = db
    .select({
      relativePath: workAssets.relativePath,
      extension: workAssets.extension,
      title: workAssets.title,
      folderPath: works.folderPath,
    })
    .from(workAssets)
    .innerJoin(works, eq(workAssets.workId, works.id))
    .where(eq(workAssets.id, id))
    .get();

  if (!row) return new NextResponse("Not found", { status: 404 });

  // Unlike the audio and cover routes, the path here is assembled from names
  // read out of a directory listing rather than ones the app chose. Confirm it
  // still lands inside the work folder before opening anything.
  const root = path.resolve(row.folderPath);
  const filePath = path.resolve(root, row.relativePath);
  if (filePath !== root && !filePath.startsWith(root + path.sep)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(filePath);
  } catch {
    return new NextResponse("File missing on disk", { status: 410 });
  }

  const ext = row.extension.toLowerCase();
  const contentType = MIME[ext] ?? "application/octet-stream";

  // `?text=1` is how the in-app reader asks for a 台本. The file is decoded
  // server-side because the client has no way to tell UTF-8 from Shift-JIS,
  // and because BOMs would otherwise show up as a stray glyph.
  if (req.nextUrl.searchParams.get("text") === "1") {
    if (stat.size > MAX_TEXT_BYTES) {
      return new NextResponse("File too large to display", { status: 413 });
    }
    const buf = await fs.promises.readFile(filePath);
    return new NextResponse(decodeTextFile(buf), {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  let servePath = filePath;
  let serveType = contentType;
  let size = stat.size;

  // `?thumb=1` asks for the gallery-sized copy. As with the audio route's
  // transcode, anything that goes wrong falls through to the original —
  // a missing thumbnail should cost sharpness, never the picture.
  if (
    req.nextUrl.searchParams.get("thumb") === "1" &&
    isThumbnailable(ext)
  ) {
    try {
      const thumb = await ensureThumbnail(id, filePath, stat.size);
      servePath = thumb;
      serveType = "image/webp";
      size = (await fs.promises.stat(thumb)).size;
    } catch {}
  }

  // `inline` keeps a PDF in the tab it opened in instead of downloading it.
  const disposition = `inline; filename*=UTF-8''${encodeURIComponent(
    row.title + ext,
  )}`;
  const range = req.headers.get("range");

  if (!range) {
    const stream = fs.createReadStream(servePath);
    return new NextResponse(fileStream(stream, req.signal), {
      status: 200,
      headers: {
        "Content-Type": serveType,
        "Content-Length": String(size),
        "Content-Disposition": disposition,
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  // Videos here run to a gigabyte, so range support is what makes seeking
  // work at all rather than an optimisation.
  const m = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!m) return new NextResponse("Bad range", { status: 416 });
  const start = m[1] ? parseInt(m[1], 10) : 0;
  const end = m[2] ? parseInt(m[2], 10) : size - 1;
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
      "Content-Type": serveType,
      "Content-Length": String(chunkSize),
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Disposition": disposition,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
