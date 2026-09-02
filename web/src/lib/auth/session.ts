import "server-only";
import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";
import { SESSION_SECRET } from "../config";

export interface SessionData {
  authenticated?: boolean;
  loginAt?: number;
}

/**
 * `next start` runs with NODE_ENV=production, which marks the cookie Secure;
 * browsers then drop it over plain http://<lan-ip>, so login never sticks.
 * KIKOERU_SECURE_COOKIES lets a deployment without TLS (the Docker default)
 * opt out. Unset keeps the historical rule.
 */
function secureCookies(): boolean {
  const v = process.env.KIKOERU_SECURE_COOKIES?.trim().toLowerCase();
  if (v === "false" || v === "0" || v === "no") return false;
  if (v === "true" || v === "1" || v === "yes") return true;
  return process.env.NODE_ENV === "production";
}

export const sessionOptions: SessionOptions = {
  password: SESSION_SECRET,
  cookieName: "kikoeru-session",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    maxAge: 60 * 60 * 24 * 30,
  },
};

export async function getSession() {
  const store = await cookies();
  return getIronSession<SessionData>(store, sessionOptions);
}

export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  return Boolean(session.authenticated);
}
