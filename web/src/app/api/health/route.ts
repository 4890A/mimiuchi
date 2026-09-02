export const dynamic = "force-dynamic";

/** Liveness probe for container orchestrators. Deliberately touches nothing
 *  (no DB, no session) so it answers even before the first migration runs.
 *  Exempted from the auth proxy in `src/proxy.ts`. */
export function GET() {
  return Response.json({ ok: true });
}
