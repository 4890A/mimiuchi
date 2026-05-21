import { NextRequest, NextResponse } from "next/server";
import { searchSuggestions } from "@/lib/search/index-builder";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const limit = Math.min(
    Math.max(parseInt(req.nextUrl.searchParams.get("limit") ?? "12", 10) || 12, 1),
    30,
  );
  if (!q.trim()) return NextResponse.json({ q, suggestions: [] });
  const suggestions = await searchSuggestions(q, limit);
  return NextResponse.json({ q, suggestions });
}
