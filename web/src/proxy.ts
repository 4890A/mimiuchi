import { NextResponse, type NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "./lib/auth/session";

const PUBLIC_PATHS = ["/login"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const res = NextResponse.next();
  const session = await getIronSession<SessionData>(req, res, sessionOptions);
  if (!session.authenticated) {
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
