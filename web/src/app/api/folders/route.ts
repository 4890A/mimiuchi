import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth/session";
import { setupNeeded } from "@/lib/auth/password";
import { extractWorkId } from "@/lib/metadata/types";
import { cleanPathInput } from "@/lib/paths";

export const dynamic = "force-dynamic";

/** Cap on folders listed, so a pathological directory cannot stall the UI. */
const MAX_ENTRIES = 2000;

export interface FolderListing {
  /** Absolute path being listed, or null for the top level (drives / `/`). */
  path: string | null;
  parent: string | null;
  folders: { name: string; path: string }[];
  /** Immediate children that look like works (folders or archives). */
  workCount: number;
  truncated: boolean;
  error?: string;
}

/** Windows drive letters that exist; `/` elsewhere. */
function topLevel(): { name: string; path: string }[] {
  if (process.platform !== "win32") {
    const home = os.homedir();
    return [
      { name: "/", path: "/" },
      ...(home && home !== "/" ? [{ name: home, path: home }] : []),
    ];
  }
  const drives: { name: string; path: string }[] = [];
  for (let c = 65; c <= 90; c++) {
    const root = `${String.fromCharCode(c)}:\\`;
    try {
      fs.accessSync(root);
      drives.push({ name: root, path: root });
    } catch {
      /* no such drive, or an empty card reader */
    }
  }
  return drives;
}

/** Names that are never a music library: dotfiles and Windows system dirs. */
function isHidden(name: string): boolean {
  return (
    name.startsWith(".") ||
    name.startsWith("$") ||
    name === "System Volume Information" ||
    name === "node_modules"
  );
}

/**
 * Lists the subfolders of a directory on the machine the server runs on, so
 * library folders can be picked rather than typed. Open during first-run
 * setup (the proxy lets it through only then); afterwards it needs a session.
 */
export async function GET(req: Request) {
  if (!setupNeeded() && !(await isAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const raw = cleanPathInput(new URL(req.url).searchParams.get("path") ?? "");
  if (!raw) {
    const listing: FolderListing = {
      path: null,
      parent: null,
      folders: topLevel(),
      workCount: 0,
      truncated: false,
    };
    return NextResponse.json(listing);
  }

  // A path the user is browsing to, so anywhere at all: not something for the
  // build's file tracer to follow.
  const dir = path.resolve(/*turbopackIgnore: true*/ raw);
  const up = path.dirname(dir);
  // At a drive root (or `/`) "up" leads back to the drive list.
  const parent = up === dir ? null : up;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    const listing: FolderListing = {
      path: dir,
      parent,
      folders: [],
      workCount: 0,
      truncated: false,
      error: (err as NodeJS.ErrnoException).code ?? String(err),
    };
    return NextResponse.json(listing);
  }

  const folders: { name: string; path: string }[] = [];
  let workCount = 0;
  for (const e of entries) {
    if (extractWorkId(e.name)) workCount++;
    if (!e.isDirectory() || isHidden(e.name)) continue;
    folders.push({ name: e.name, path: path.join(dir, e.name) });
  }
  folders.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
  );

  const listing: FolderListing = {
    path: dir,
    parent,
    folders: folders.slice(0, MAX_ENTRIES),
    workCount,
    truncated: folders.length > MAX_ENTRIES,
  };
  return NextResponse.json(listing);
}
