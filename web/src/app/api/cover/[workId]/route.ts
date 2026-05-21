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
  _req: NextRequest,
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
  return new NextResponse(
    fs.createReadStream(row.coverPath) as unknown as ReadableStream,
    {
      headers: {
        "Content-Type": MIME[ext] ?? "image/jpeg",
        "Content-Length": String(stat.size),
        "Cache-Control": "private, max-age=86400, immutable",
      },
    },
  );
}
