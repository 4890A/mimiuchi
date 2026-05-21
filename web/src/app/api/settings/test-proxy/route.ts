import { NextResponse } from "next/server";
import { ProxyAgent, fetch as undiciFetch } from "undici";

const TEST_URL = "https://www.dlsite.com/maniax/api/=/product.json?workno=RJ01402281";

export async function POST(req: Request) {
  const { url } = (await req.json()) as { url?: string };
  if (!url || !url.trim()) {
    return NextResponse.json(
      { ok: false, message: "Proxy URL is required" },
      { status: 400 },
    );
  }
  const trimmed = url.trim();

  let dispatcher: ProxyAgent;
  try {
    dispatcher = new ProxyAgent(trimmed);
  } catch (err) {
    return NextResponse.json({
      ok: false,
      message: `Invalid proxy URL: ${String(err)}`,
    });
  }

  const start = Date.now();
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 10_000);
    const res = await undiciFetch(TEST_URL, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "kikoeru-nouveau/proxy-test",
        "Accept-Language": "ja-JP,ja;q=0.9,en;q=0.5",
        Cookie: "adultchecked=1; locale=ja-jp",
      },
      dispatcher,
    });
    clearTimeout(timeout);
    const elapsed = Date.now() - start;
    if (!res.ok) {
      return NextResponse.json({
        ok: false,
        message: `Proxy reached DLsite but got HTTP ${res.status} in ${elapsed}ms`,
      });
    }
    const text = await res.text();
    let workno: string | undefined;
    try {
      const json = JSON.parse(text);
      workno = Array.isArray(json) ? json[0]?.workno : undefined;
    } catch {}
    return NextResponse.json({
      ok: true,
      message: workno
        ? `OK — fetched ${workno} via proxy in ${elapsed}ms`
        : `OK — proxy responded ${res.status} in ${elapsed}ms`,
      elapsedMs: elapsed,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      message: `Proxy request failed: ${(err as Error).message ?? String(err)}`,
    });
  }
}
