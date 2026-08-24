import "server-only";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/lib/config";

/**
 * Small copies of extra illustrations, for the gallery grid.
 *
 * The source images are print-resolution: a typical bonus illustration is
 * 2000×3000 and 4 MB, and one work ships twenty-two of them. Rendering those
 * straight into 145-pixel squares would pull ~90 MB over the wire to draw a
 * thumbnail strip — fine on the machine serving it, hopeless on the phone this
 * app is mostly read from.
 *
 * Written to disk and served through the ordinary file path in the asset
 * route, like `lib/transcode.ts`, so the cache is a plain directory that is
 * safe to delete at any time and rebuilds on demand.
 */

/** Wide enough for a 2x display at the grid's largest rendered size. */
const WIDTH = 480;

const DEFAULT_CACHE_MB = 512;

export const THUMBNAIL_DIR = path.join(DATA_DIR, "thumbnails");

const THUMBNAILABLE = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp"]);

/** GIFs are excluded: a still frame of an animation is a worse thumbnail. */
export function isThumbnailable(extension: string): boolean {
  return THUMBNAILABLE.has(extension.toLowerCase());
}

/**
 * Keyed by source size as well as asset id, so a replaced file gets a new
 * entry instead of serving a thumbnail of an image that is no longer there.
 */
function cachePath(assetId: number, sourceSize: number): string {
  return path.join(THUMBNAIL_DIR, `${assetId}-${sourceSize}-${WIDTH}.webp`);
}

function cacheLimitBytes(): number {
  const raw = process.env.KIKOERU_THUMBNAIL_CACHE_MB?.trim();
  const mb = raw ? Number(raw) : DEFAULT_CACHE_MB;
  if (!Number.isFinite(mb) || mb < 0) return DEFAULT_CACHE_MB * 1024 * 1024;
  return mb * 1024 * 1024;
}

/** Eviction is least-recently-used and reads mtime, so a hit must bump it. */
function touch(file: string): void {
  try {
    const now = new Date();
    fs.utimesSync(file, now, now);
  } catch {}
}

function dropStaleSiblings(assetId: number, keep: string): void {
  let names: string[];
  try {
    names = fs.readdirSync(THUMBNAIL_DIR);
  } catch {
    return;
  }
  const prefix = `${assetId}-`;
  for (const name of names) {
    if (!name.startsWith(prefix) || !name.endsWith(".webp")) continue;
    const full = path.join(THUMBNAIL_DIR, name);
    if (full === keep) continue;
    try {
      fs.unlinkSync(full);
    } catch {}
  }
}

function evict(keep: string): void {
  const limit = cacheLimitBytes();
  if (limit <= 0) return;

  let entries: { path: string; size: number; used: number }[];
  try {
    entries = fs
      .readdirSync(THUMBNAIL_DIR)
      .filter((name) => name.endsWith(".webp"))
      .map((name) => {
        const full = path.join(THUMBNAIL_DIR, name);
        const stat = fs.statSync(full);
        return { path: full, size: stat.size, used: stat.mtimeMs };
      });
  } catch {
    return;
  }

  let total = entries.reduce((sum, e) => sum + e.size, 0);
  if (total <= limit) return;

  entries.sort((a, b) => a.used - b.used);
  for (const entry of entries) {
    if (total <= limit) break;
    if (entry.path === keep) continue;
    try {
      fs.unlinkSync(entry.path);
      total -= entry.size;
    } catch {}
  }
}

/** Concurrent requests for one image share a single encode. */
const inFlight = new Map<string, Promise<string>>();

/**
 * Returns the path to a downscaled copy of `sourcePath`, making it on first
 * request.
 *
 * Rejects when sharp is unavailable or the image is unreadable. The caller is
 * expected to fall back to the original file: a thumbnail that cannot be built
 * should cost the user sharpness, never the picture.
 */
export function ensureThumbnail(
  assetId: number,
  sourcePath: string,
  sourceSize: number,
): Promise<string> {
  const dest = cachePath(assetId, sourceSize);

  if (fs.existsSync(dest)) {
    touch(dest);
    return Promise.resolve(dest);
  }

  const existing = inFlight.get(dest);
  if (existing) return existing;

  const job = (async () => {
    // Imported lazily, and allowed to fail: sharp arrives as a transitive
    // dependency of Next, so treating it as optional keeps a stripped install
    // serving full-size images rather than serving none.
    const sharp = (await import("sharp")).default;
    await fs.promises.mkdir(THUMBNAIL_DIR, { recursive: true });
    const tmp = `${dest}.${process.pid}.tmp`;
    await sharp(sourcePath, { failOn: "none" })
      // `withoutEnlargement` keeps an already-small image from being blown up
      // to 480 and coming back bigger than the file it replaced.
      .resize({ width: WIDTH, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toFile(tmp);
    // Rename last, so a reader never sees a half-written file.
    await fs.promises.rename(tmp, dest);
    dropStaleSiblings(assetId, dest);
    evict(dest);
    return dest;
  })().finally(() => {
    inFlight.delete(dest);
  });

  inFlight.set(dest, job);
  return job;
}
