import { NextResponse } from "next/server";
import { saveProgress } from "@/lib/actions";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    trackId?: number;
    positionSeconds?: number;
    completed?: boolean;
  };
  if (typeof body.trackId !== "number" || typeof body.positionSeconds !== "number") {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  await saveProgress(body.trackId, body.positionSeconds, body.completed ?? false);
  return NextResponse.json({ ok: true });
}
