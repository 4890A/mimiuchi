import { NextRequest, NextResponse } from "next/server";
import { searchSuggestions, type SuggestionType } from "@/lib/search/index-builder";

export const dynamic = "force-dynamic";

const VALID_TYPES: SuggestionType[] = ["seiyuu", "circle", "tag", "work"];

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const typeParam = req.nextUrl.searchParams.get("type");
  const type = VALID_TYPES.includes(typeParam as SuggestionType)
    ? (typeParam as SuggestionType)
    : undefined;
  const maxLimit = type ? 300 : 30;
  const limit = Math.min(
    Math.max(parseInt(req.nextUrl.searchParams.get("limit") ?? "12", 10) || 12, 1),
    maxLimit,
  );
  if (!q.trim()) return NextResponse.json({ q, suggestions: [] });
  const suggestions = await searchSuggestions(q, limit, { type });
  return NextResponse.json({ q, suggestions });
}
