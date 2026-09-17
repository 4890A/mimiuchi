import "server-only";
import { cookies, headers } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";
import { SESSION_SECRET } from "../config";
import { secureCookie } from "./secure-cookie";

export interface SessionData {
  authenticated?: boolean;
  loginAt?: number;
}

/**
 * Session options for one request. The Secure flag depends on how that request
 * arrived (see `secureCookie`). One app can be reached over HTTPS through a
 * reverse proxy and over plain http://<lan-ip> at the same time.
 */
export function sessionOptions(forwardedProto: string | null): SessionOptions {
  return {
    password: SESSION_SECRET,
    cookieName: "kikoeru-session",
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookie(process.env.KIKOERU_SECURE_COOKIES, forwardedProto),
      maxAge: 60 * 60 * 24 * 30,
    },
  };
}

export async function getSession() {
  const [store, hdrs] = await Promise.all([cookies(), headers()]);
  return getIronSession<SessionData>(
    store,
    sessionOptions(hdrs.get("x-forwarded-proto")),
  );
}

export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  return Boolean(session.authenticated);
}
