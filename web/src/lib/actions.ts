"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { db } from "./db/client";
import { likes, trackProgress, tags, workTags, works } from "./db/schema";
import { invalidateSearchIndex } from "./search/index-builder";
import { invalidateFilterListCache, listRandomWorks, type RecentWork } from "./db/queries";

export async function getRandomWorks(limit = 8): Promise<RecentWork[]> {
  return listRandomWorks(limit);
}

export async function toggleLike(trackId: number): Promise<{ liked: boolean }> {
  const existing = db.select().from(likes).where(eq(likes.trackId, trackId)).get();
  if (existing) {
    db.delete(likes).where(eq(likes.trackId, trackId)).run();
    revalidatePath("/liked");
    return { liked: false };
  }
  db.insert(likes).values({ trackId }).run();
  revalidatePath("/liked");
  return { liked: true };
}

export async function addTagToWork(
  workId: string,
  tagName: string,
): Promise<{ ok: true; tagId: number; name: string } | { ok: false; error: string }> {
  const name = tagName.trim();
  if (!name) return { ok: false, error: "empty" };
  if (name.length > 80) return { ok: false, error: "too long" };

  const work = db.select({ id: works.id }).from(works).where(eq(works.id, workId)).get();
  if (!work) return { ok: false, error: "work not found" };

  let tag = db.select().from(tags).where(eq(tags.name, name)).get();
  if (!tag) {
    const inserted = db
      .insert(tags)
      .values({ name })
      .returning({ id: tags.id, name: tags.name, nameEn: tags.nameEn, category: tags.category })
      .get();
    tag = inserted;
  }

  const existingLink = db
    .select()
    .from(workTags)
    .where(and(eq(workTags.workId, workId), eq(workTags.tagId, tag.id)))
    .get();
  if (!existingLink) {
    db.insert(workTags).values({ workId, tagId: tag.id }).run();
  }

  invalidateSearchIndex();
  invalidateFilterListCache();
  revalidatePath(`/works/${workId}`);
  return { ok: true, tagId: tag.id, name: tag.name };
}

/** Remove a work and everything attached to it (tracks, tags, voice-actor
 *  links, likes, progress — all via FK cascade) plus its local cover file.
 *  Does NOT touch the audio files on disk; use this for stale entries whose
 *  folder was renamed or removed. */
export async function deleteWork(
  workId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = db
    .select({ coverPath: works.coverPath })
    .from(works)
    .where(eq(works.id, workId))
    .get();
  if (!row) return { ok: false, error: "work not found" };

  db.delete(works).where(eq(works.id, workId)).run();

  if (row.coverPath) {
    try {
      fs.rmSync(row.coverPath, { force: true });
    } catch {
      // best-effort cover cleanup; the DB row is already gone
    }
  }

  invalidateSearchIndex();
  invalidateFilterListCache();
  revalidatePath("/");
  revalidatePath("/liked");
  return { ok: true };
}

/** Open the work's folder in the host machine's file manager. Only useful
 *  when the browser and the Next.js server are on the same machine. */
export async function revealWorkFolder(
  workId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = db
    .select({ folderPath: works.folderPath })
    .from(works)
    .where(eq(works.id, workId))
    .get();
  if (!row) return { ok: false, error: "work not found" };
  if (!fs.existsSync(row.folderPath)) {
    return { ok: false, error: "folder does not exist on host" };
  }

  try {
    if (process.platform === "win32") {
      spawn("explorer.exe", [row.folderPath], { detached: true }).unref();
    } else if (process.platform === "darwin") {
      spawn("open", [row.folderPath], { detached: true }).unref();
    } else {
      spawn("xdg-open", [row.folderPath], { detached: true }).unref();
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function saveProgress(
  trackId: number,
  positionSeconds: number,
  completed = false,
): Promise<void> {
  db.insert(trackProgress)
    .values({ trackId, positionSeconds, completed, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: trackProgress.trackId,
      set: {
        positionSeconds,
        completed,
        updatedAt: new Date(),
      },
    })
    .run();
}
