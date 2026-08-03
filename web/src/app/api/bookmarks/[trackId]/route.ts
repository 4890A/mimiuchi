import { NextResponse, type NextRequest } from "next/server";
import {
  addBookmark,
  getBookmarks,
  removeBookmark,
} from "@/lib/bookmarks";

function parseTrackId(raw: string): number | null {
  const id = parseInt(raw, 10);
  return Number.isFinite(id) ? id : null;
}

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/bookmarks/[trackId]">,
) {
  const { trackId } = await ctx.params;
  const id = parseTrackId(trackId);
  if (id === null) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  return NextResponse.json({ bookmarks: getBookmarks(id) });
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/bookmarks/[trackId]">,
) {
  const { trackId } = await ctx.params;
  const id = parseTrackId(trackId);
  if (id === null) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as {
    positionSeconds?: number;
  } | null;
  const at = body?.positionSeconds;
  if (typeof at !== "number" || !Number.isFinite(at) || at < 0) {
    return NextResponse.json({ error: "bad position" }, { status: 400 });
  }

  return NextResponse.json({ bookmarks: addBookmark(id, at) });
}

export async function DELETE(
  req: NextRequest,
  ctx: RouteContext<"/api/bookmarks/[trackId]">,
) {
  const { trackId } = await ctx.params;
  const id = parseTrackId(trackId);
  if (id === null) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  // Number(null) and Number("") are both 0, which would silently delete a
  // bookmark at the start of the track instead of rejecting the request.
  const raw = req.nextUrl.searchParams.get("at");
  const at = raw === null || raw.trim() === "" ? NaN : Number(raw);
  if (!Number.isFinite(at) || at < 0) {
    return NextResponse.json({ error: "bad position" }, { status: 400 });
  }

  return NextResponse.json({ bookmarks: removeBookmark(id, at) });
}
