import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { works } from "@/lib/db/schema";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/cover/[workId]">,
) {
  const { workId } = await ctx.params;
  const row = db
    .select({ coverPath: works.coverPath })
    .from(works)
    .where(eq(works.id, workId))
    .get();
  if (!row?.coverPath) return new NextResponse(null, { status: 404 });
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(row.coverPath);
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  const ext = path.extname(row.coverPath).toLowerCase();

  // Validate against the file's size + mtime so the browser refetches the
  // moment a cover is replaced in-app. `no-cache` keeps the image cacheable
  // but forces a (cheap, usually 304) revalidation on every load — unlike
  // `immutable`, which would pin a stale image for the full max-age window.
  const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const cacheHeaders = {
    ETag: etag,
    "Last-Modified": stat.mtime.toUTCString(),
    "Cache-Control": "private, no-cache",
  };
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: cacheHeaders });
  }

  return new NextResponse(
    fs.createReadStream(row.coverPath) as unknown as ReadableStream,
    {
      headers: {
        ...cacheHeaders,
        "Content-Type": MIME[ext] ?? "image/jpeg",
        "Content-Length": String(stat.size),
      },
    },
  );
}
