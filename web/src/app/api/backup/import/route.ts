import { NextResponse } from "next/server";
import {
  BackupValidationError,
  restoreBackup,
  validateBackup,
} from "@/lib/backup";
import { isAuthenticated } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Refuse absurd uploads before spending memory parsing them. */
const MAX_BYTES = 500 * 1024 * 1024;

export async function POST(req: Request) {
  // This route is excluded from proxy.ts (which would truncate the upload at
  // `proxyClientMaxBodySize`), so it has to check the session itself.
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "true";
  const includeWaveforms = url.searchParams.get("includeWaveforms") !== "false";

  let text: string;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Invalid request: expected a `file` field" },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `Backup file exceeds maximum size of ${MAX_BYTES / 1024 / 1024}MB` },
        { status: 400 },
      );
    }
    text = await file.text();
  } catch (err) {
    return NextResponse.json(
      { error: `Could not read upload: ${String(err)}` },
      { status: 400 },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: "Invalid backup file: not valid JSON" },
      { status: 400 },
    );
  }

  try {
    validateBackup(parsed);
  } catch (err) {
    if (err instanceof BackupValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  const summary = await restoreBackup(parsed, { dryRun, includeWaveforms });
  return NextResponse.json(summary);
}
