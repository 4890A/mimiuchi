import { NextResponse } from "next/server";
import { getSettings, setSettings, type AppSettings } from "@/lib/settings";

export async function GET() {
  return NextResponse.json(getSettings());
}

export async function PUT(req: Request) {
  const body = (await req.json()) as Partial<AppSettings>;
  const updated = setSettings(body);
  return NextResponse.json(updated);
}
