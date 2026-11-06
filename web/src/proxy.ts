import { NextResponse, type NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import {
  isSessionValid,
  sessionOptions,
  type SessionData,
} from "./lib/auth/session";
import { setupNeeded } from "./lib/auth/password";

const PUBLIC_PATHS = ["/login"];

/** All a visitor can reach before a password exists: the setup page and the
 *  folder browser it uses. */
const SETUP_PATHS = ["/setup", "/api/folders"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // First run: no password yet, so nothing is protected and nothing can be
  // signed into. Everything leads to /setup until it is done. The setup page
  // itself refuses to run again afterwards.
  if (setupNeeded()) {
    if (SETUP_PATHS.includes(pathname)) return NextResponse.next();
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "setup required" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/setup";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (
    pathname === "/setup" ||
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
  ) {
    return NextResponse.next();
  }

  const res = NextResponse.next();
  const session = await getIronSession<SessionData>(
    req,
    res,
    sessionOptions(req.headers.get("x-forwarded-proto")),
  );
  if (!isSessionValid(session)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = {
  // `/api/backup/import` is exempt: the proxy buffers a matched request's body
  // so it can be read twice, capped by `proxyClientMaxBodySize` (10MB by
  // default). A backup upload is far larger than that and would arrive
  // truncated. The route authenticates itself instead — see its own
  // `isAuthenticated()` check.
  // `/api/health` is exempt too: it is the container liveness probe and must
  // answer 200 without a session.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/backup/import|api/health).*)",
  ],
};
