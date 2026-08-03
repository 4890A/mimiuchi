import { NextResponse, type NextRequest } from "next/server";
import { getBookmarksForTracks } from "@/lib/bookmarks";

/** Bound the request so a malformed query can't ask for the whole library. */
const MAX_IDS = 500;

/**
 * Batch lookup for the track list: `?trackIds=1,2,3`.
 *
 * One request per work rather than one per row.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("trackIds");
  if (!raw) {
    return NextResponse.json({ error: "trackIds required" }, { status: 400 });
  }

  const ids = Array.from(
    new Set(
      raw
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n)),
    ),
  );

  if (ids.length === 0) {
    return NextResponse.json({ error: "no valid trackIds" }, { status: 400 });
  }
  if (ids.length > MAX_IDS) {
    return NextResponse.json({ error: "too many trackIds" }, { status: 400 });
  }

  return NextResponse.json({ bookmarks: getBookmarksForTracks(ids) });
}
