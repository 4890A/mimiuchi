"use server";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { db } from "./db/client";
import {
  circles,
  likes,
  trackProgress,
  tags,
  voiceActors,
  workTags,
  workVoiceActors,
  works,
} from "./db/schema";
import { invalidateSearchIndex } from "./search/index-builder";
import { invalidateFilterListCache, listRandomWorks, type RecentWork } from "./db/queries";
import { upsertWork } from "./db/repository";
import { fetchMetadata, downloadCover, DlsiteUnavailableError } from "./metadata";
import { getSettings } from "./settings";
import { resolveCoversDir } from "./config";

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

/** Normalize a free-text field: trim, and treat blank as "clear to null". */
function normText(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t ? t : null;
}

/** Replace a work's voice-actor set with `names` (find-or-create each). */
function syncVoiceActors(workId: string, names: string[]) {
  const wanted = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const ids: number[] = [];
  for (const name of wanted) {
    let va = db.select().from(voiceActors).where(eq(voiceActors.name, name)).get();
    if (!va) va = db.insert(voiceActors).values({ name }).returning().get();
    ids.push(va.id);
  }
  db.delete(workVoiceActors).where(eq(workVoiceActors.workId, workId)).run();
  for (const voiceActorId of ids) {
    db.insert(workVoiceActors).values({ workId, voiceActorId }).run();
  }
}

/** Replace a work's tag set with `names` (find-or-create each). */
function syncTags(workId: string, names: string[]) {
  const wanted = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const ids: number[] = [];
  for (const name of wanted) {
    let tag = db.select().from(tags).where(eq(tags.name, name)).get();
    if (!tag) tag = db.insert(tags).values({ name }).returning().get();
    ids.push(tag.id);
  }
  db.delete(workTags).where(eq(workTags.workId, workId)).run();
  for (const tagId of ids) {
    db.insert(workTags).values({ workId, tagId }).run();
  }
}

export interface WorkEditInput {
  title?: string;
  circleName?: string | null;
  releaseDate?: string | null;
  workType?: string | null;
  language?: string | null;
  description?: string | null;
  nsfw?: boolean;
  voiceActors?: string[];
  tags?: string[];
}

/** Edit a work's metadata in place: title, circle, release date, type,
 *  language, description, NSFW flag, and the full voice-actor / tag sets.
 *  Intended for works whose DLsite listing is gone and thus can't be
 *  re-fetched by the scanner. Cover changes go through the cover actions. */
export async function updateWorkDetails(
  workId: string,
  input: WorkEditInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const work = db.select({ id: works.id }).from(works).where(eq(works.id, workId)).get();
  if (!work) return { ok: false, error: "work not found" };

  const patch: Partial<typeof works.$inferInsert> = {};

  if (input.title !== undefined) {
    const t = input.title.trim();
    if (!t) return { ok: false, error: "title is required" };
    if (t.length > 500) return { ok: false, error: "title too long" };
    patch.title = t;
  }
  if (input.releaseDate !== undefined) patch.releaseDate = normText(input.releaseDate);
  if (input.workType !== undefined) patch.workType = normText(input.workType);
  if (input.language !== undefined) patch.language = normText(input.language);
  if (input.description !== undefined) patch.description = normText(input.description);
  if (input.nsfw !== undefined) patch.nsfw = input.nsfw;

  if (input.circleName !== undefined) {
    const cname = normText(input.circleName);
    if (!cname) {
      patch.circleId = null;
    } else {
      let circle = db.select().from(circles).where(eq(circles.name, cname)).get();
      if (!circle) circle = db.insert(circles).values({ name: cname }).returning().get();
      patch.circleId = circle.id;
    }
  }

  if (Object.keys(patch).length > 0) {
    db.update(works).set(patch).where(eq(works.id, workId)).run();
  }

  if (input.voiceActors !== undefined) syncVoiceActors(workId, input.voiceActors);
  if (input.tags !== undefined) syncTags(workId, input.tags);

  invalidateSearchIndex();
  invalidateFilterListCache();
  revalidatePath(`/works/${workId}`);
  revalidatePath("/");
  return { ok: true };
}

/** The freshly fetched fields, shaped for the edit dialog's form state. */
export interface RefreshedWorkMetadata {
  title: string;
  circleName: string | null;
  releaseDate: string | null;
  workType: string | null;
  language: string | null;
  description: string | null;
  nsfw: boolean;
  voiceActors: string[];
  tags: string[];
  coverUrl: string | null;
}

/** Re-fetch a single work from DLsite and overwrite its
 *  stored details, tags, voice actors and cover — the same write the scanner
 *  does with `forceMetadata`, minus the library walk. Local edits to that
 *  work are lost, which is the point: it's the "undo my edits / pick up the
 *  listing's changes" escape hatch. */
export async function refreshWorkMetadata(
  workId: string,
): Promise<
  { ok: true; work: RefreshedWorkMetadata } | { ok: false; error: string }
> {
  const row = db
    .select({
      folderPath: works.folderPath,
      coverPath: works.coverPath,
      isArchive: works.isArchive,
    })
    .from(works)
    .where(eq(works.id, workId))
    .get();
  if (!row) return { ok: false, error: "work not found" };

  let metadata;
  try {
    metadata = await fetchMetadata(workId);
  } catch (err) {
    // The retries are already spent by the time this throws, so say so plainly
    // instead of surfacing a stack-ish blob in a toast.
    if (err instanceof DlsiteUnavailableError) {
      return { ok: false, error: "DLsite is not responding — try again later" };
    }
    return { ok: false, error: String(err) };
  }
  if (!metadata) return { ok: false, error: "no listing found" };

  let coverPath: string | undefined;
  if (metadata.coverUrl) {
    try {
      const coversDir = resolveCoversDir(getSettings().coversDir);
      const ext = path.extname(new URL(metadata.coverUrl).pathname) || ".jpg";
      const dest = path.join(coversDir, `${workId}${ext}`);
      if (await downloadCover(metadata.coverUrl, dest)) {
        coverPath = dest;
        // A previous cover with a different extension would be orphaned.
        if (row.coverPath && path.resolve(row.coverPath) !== path.resolve(dest)) {
          try {
            fs.rmSync(row.coverPath, { force: true });
          } catch {
            // best-effort cleanup of the superseded file
          }
        }
      }
    } catch {
      // bad cover URL or unwritable covers dir; keep the metadata anyway
    }
  }

  // Carry the archive flag over: only a scan, which actually looks at the
  // disk, gets to decide whether the work is still packed.
  upsertWork({
    id: workId,
    folderPath: row.folderPath,
    metadata,
    coverPath,
    isArchive: row.isArchive,
  });

  invalidateSearchIndex();
  invalidateFilterListCache();
  revalidatePath(`/works/${workId}`);
  revalidatePath("/");

  return {
    ok: true,
    work: {
      title: metadata.title,
      circleName: metadata.circleName ?? null,
      releaseDate: metadata.releaseDate ?? null,
      workType: metadata.workType ?? null,
      language: metadata.language ?? null,
      description: metadata.description ?? null,
      nsfw: metadata.nsfw ?? false,
      voiceActors: metadata.voiceActors.map((va) => va.name),
      tags: metadata.tags.map((t) => t.name),
      coverUrl: metadata.coverUrl ?? null,
    },
  };
}

const COVER_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};
const MAX_COVER_BYTES = 20 * 1024 * 1024;

/** Replace a work's cover with an uploaded image file. Writes it into the
 *  configured covers directory as `${workId}${ext}` and points coverPath at
 *  it, so the local file wins over any remote coverUrl. */
export async function uploadWorkCover(
  workId: string,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = db
    .select({ coverPath: works.coverPath })
    .from(works)
    .where(eq(works.id, workId))
    .get();
  if (!row) return { ok: false, error: "work not found" };

  const file = formData.get("cover");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "no image provided" };
  }
  if (file.size > MAX_COVER_BYTES) return { ok: false, error: "image too large (max 20MB)" };
  const ext = COVER_EXT[file.type];
  if (!ext) return { ok: false, error: "unsupported image type" };

  const coversDir = resolveCoversDir(getSettings().coversDir);
  const dest = path.join(coversDir, `${workId}${ext}`);
  try {
    await fs.promises.mkdir(coversDir, { recursive: true });
    const buf = Buffer.from(await file.arrayBuffer());
    await fs.promises.writeFile(dest, buf);
  } catch (err) {
    return { ok: false, error: `couldn't save image: ${String(err)}` };
  }

  // A previous cover with a different extension would otherwise be orphaned.
  if (row.coverPath && path.resolve(row.coverPath) !== path.resolve(dest)) {
    try {
      fs.rmSync(row.coverPath, { force: true });
    } catch {
      // best-effort cleanup of the superseded file
    }
  }

  db.update(works).set({ coverPath: dest }).where(eq(works.id, workId)).run();
  revalidatePath(`/works/${workId}`);
  revalidatePath("/");
  return { ok: true };
}

/** Point a work's cover at a remote URL. Clears any local cover file so the
 *  URL is the one that renders. */
export async function setWorkCoverUrl(
  workId: string,
  url: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return { ok: false, error: "enter a valid http(s) URL" };
  }
  const row = db
    .select({ coverPath: works.coverPath })
    .from(works)
    .where(eq(works.id, workId))
    .get();
  if (!row) return { ok: false, error: "work not found" };

  db.update(works)
    .set({ coverUrl: trimmed, coverPath: null })
    .where(eq(works.id, workId))
    .run();

  if (row.coverPath) {
    try {
      fs.rmSync(row.coverPath, { force: true });
    } catch {
      // best-effort cleanup of the now-unused local file
    }
  }

  revalidatePath(`/works/${workId}`);
  revalidatePath("/");
  return { ok: true };
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

/** Open the work in the host machine's file manager: its folder, or — for a
 *  work still packed in an archive — the containing folder with the archive
 *  file selected, ready to be extracted by hand. Only useful when the browser
 *  and the Next.js server are on the same machine. */
export async function revealWorkFolder(
  workId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = db
    .select({ folderPath: works.folderPath, isArchive: works.isArchive })
    .from(works)
    .where(eq(works.id, workId))
    .get();
  if (!row) return { ok: false, error: "work not found" };
  if (!fs.existsSync(row.folderPath)) {
    return { ok: false, error: "folder does not exist on host" };
  }

  try {
    if (process.platform === "win32") {
      // `explorer.exe <file>` would hand the archive to whatever is registered
      // to open it; /select, opens the folder around it instead. Explorer
      // wants the switch and the path as one argument.
      const args = row.isArchive
        ? [`/select,${row.folderPath}`]
        : [row.folderPath];
      spawn("explorer.exe", args, { detached: true }).unref();
    } else if (process.platform === "darwin") {
      const args = row.isArchive ? ["-R", row.folderPath] : [row.folderPath];
      spawn("open", args, { detached: true }).unref();
    } else {
      // No portable "reveal" on Linux; open the containing directory.
      const target = row.isArchive ? path.dirname(row.folderPath) : row.folderPath;
      spawn("xdg-open", [target], { detached: true }).unref();
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
