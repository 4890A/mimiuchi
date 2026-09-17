/**
 * Whether the session cookie should carry the Secure attribute.
 *
 * A browser drops a Secure cookie set over plain HTTP, except on localhost. So
 * the flag has to follow the scheme the browser actually used. It can't come
 * from NODE_ENV: a production build reached as http://<lan-ip> from a phone
 * would log in, then bounce back to /login on the next request.
 *
 * `override` is KIKOERU_SECURE_COOKIES and forces the answer either way.
 * Otherwise the request's `x-forwarded-proto` decides. Next fills that header
 * in from the socket when no reverse proxy has set it. Behind a chain of
 * proxies it is a list, and the first entry is the hop the browser spoke to.
 */
export function secureCookie(
  override: string | undefined,
  forwardedProto: string | null,
): boolean {
  const v = override?.trim().toLowerCase();
  if (v === "false" || v === "0" || v === "no") return false;
  if (v === "true" || v === "1" || v === "yes") return true;
  return forwardedProto?.split(",")[0].trim().toLowerCase() === "https";
}
