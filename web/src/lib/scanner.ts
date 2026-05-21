import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { extractWorkId } from "./metadata/types";
import { fetchMetadata, downloadCover } from "./metadata";
import {
  upsertWork,
  upsertTrack,
  pruneTracksNotIn,
  getWorkById,
  getWorkMetadataCounts,
} from "./db/repository";
import { invalidateSearchIndex } from "./search/index-builder";
import fsSync from "node:fs";

const AUDIO_EXTS = new Set([
  ".mp3",
  ".flac",
  ".wav",
  ".m4a",
  ".aac",
  ".ogg",
  ".opus",
  ".wma",
]);

const TRACK_NUM_RE = /^\s*(\d{1,3})[\.\-_\s]/;

export type ScanEvent =
  | { type: "start"; total: number; libraryRoot: string }
  | {
      type: "work-start";
      workId: string;
      index: number;
      total: number;
      folder: string;
      hadExisting: boolean;
    }
  | { type: "fetch-meta"; workId: string }
  | {
      type: "meta-result";
      workId: string;
      found: boolean;
      title?: string;
      source?: string;
      coverUrl?: string;
    }
  | { type: "fetch-cover"; workId: string; url: string }
  | { type: "cover-saved"; workId: string }
  | { type: "meta-skipped"; workId: string }
  | { type: "tracks-done"; workId: string; tracks: number }
  | { type: "work-done"; workId: string; title?: string; hasCover: boolean }
  | { type: "error"; workId?: string; message: string }
  | { type: "done"; result: ScanResult };

export interface ScanOptions {
  libraryRoot: string;
  coversDir: string;
  forceMetadata?: boolean;
  /** If set, only scan works whose id is in this list. */
  filterIds?: ReadonlySet<string>;
  onEvent?: (event: ScanEvent) => void;
}

export interface ScanResult {
  worksFound: number;
  worksNew: number;
  tracksScanned: number;
  metadataFetched: number;
  errors: string[];
}

async function* walk(dir: string, depth = 0): AsyncGenerator<string> {
  if (depth > 6) return;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full, depth + 1);
    else if (e.isFile()) yield full;
  }
}

async function findWorkFolders(root: string): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  async function scan(dir: string, depth: number): Promise<void> {
    if (depth > 4) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const full = path.join(dir, e.name);
      const id = extractWorkId(e.name);
      if (id && !found.has(id)) {
        found.set(id, full);
      } else {
        await scan(full, depth + 1);
      }
    }
  }
  await scan(root, 0);
  return found;
}

function makeTrackTitle(filename: string): {
  title: string;
  trackNumber?: number;
} {
  const base = filename.replace(/\.[^.]+$/, "");
  const m = base.match(TRACK_NUM_RE);
  const trackNumber = m ? parseInt(m[1], 10) : undefined;
  const title = trackNumber
    ? base.replace(TRACK_NUM_RE, "").trim() || base
    : base;
  return { title, trackNumber };
}

export async function scanLibrary(opts: ScanOptions): Promise<ScanResult> {
  const result: ScanResult = {
    worksFound: 0,
    worksNew: 0,
    tracksScanned: 0,
    metadataFetched: 0,
    errors: [],
  };
  const emit = (e: ScanEvent) => opts.onEvent?.(e);

  let workFolders: Map<string, string>;
  try {
    workFolders = await findWorkFolders(opts.libraryRoot);
  } catch (err) {
    const message = `Failed to read library root: ${String(err)}`;
    result.errors.push(message);
    emit({ type: "error", message });
    emit({ type: "done", result });
    return result;
  }

  if (opts.filterIds) {
    for (const id of workFolders.keys()) {
      if (!opts.filterIds.has(id)) workFolders.delete(id);
    }
  }

  result.worksFound = workFolders.size;
  const total = workFolders.size;
  emit({ type: "start", total, libraryRoot: opts.libraryRoot });

  let index = 0;
  for (const [workId, folder] of workFolders) {
    index++;
    try {
      const existing = getWorkById(workId);
      const counts = existing ? getWorkMetadataCounts(workId) : { tagCount: 0, voiceActorCount: 0 };
      const coverMissing =
        !existing?.coverPath || !fsSync.existsSync(existing.coverPath);
      const tagsMissing = counts.tagCount === 0;
      const needsMeta =
        opts.forceMetadata ||
        !existing?.metadataSource ||
        !existing?.lastMetadataSyncAt ||
        coverMissing ||
        tagsMissing;

      emit({
        type: "work-start",
        workId,
        index,
        total,
        folder,
        hadExisting: Boolean(existing),
      });

      let metadata = null;
      let coverPath = coverMissing ? undefined : existing?.coverPath ?? undefined;

      if (needsMeta) {
        emit({ type: "fetch-meta", workId });
        metadata = await fetchMetadata(workId);
        emit({
          type: "meta-result",
          workId,
          found: Boolean(metadata),
          title: metadata?.title,
          source: metadata?.source,
          coverUrl: metadata?.coverUrl,
        });
        if (metadata) {
          result.metadataFetched++;
          if (metadata.coverUrl) {
            const ext = path.extname(new URL(metadata.coverUrl).pathname) || ".jpg";
            const dest = path.join(opts.coversDir, `${workId}${ext}`);
            emit({ type: "fetch-cover", workId, url: metadata.coverUrl });
            const ok = await downloadCover(metadata.coverUrl, dest);
            if (ok) {
              coverPath = dest;
              emit({ type: "cover-saved", workId });
            }
          }
        } else {
          const message = `No metadata found for ${workId}`;
          result.errors.push(message);
          emit({ type: "error", workId, message });
        }
      } else {
        emit({ type: "meta-skipped", workId });
      }

      upsertWork({ id: workId, folderPath: folder, metadata, coverPath });
      if (!existing) result.worksNew++;

      const keptPaths: string[] = [];
      let workTracks = 0;
      for await (const filePath of walk(folder)) {
        const ext = path.extname(filePath).toLowerCase();
        if (!AUDIO_EXTS.has(ext)) continue;
        const rel = path.relative(folder, filePath);
        const stat = await fs.stat(filePath).catch(() => null);
        const { title, trackNumber } = makeTrackTitle(path.basename(filePath));
        upsertTrack({
          workId,
          title,
          relativePath: rel,
          extension: ext,
          sizeBytes: stat?.size ?? undefined,
          trackNumber,
        });
        keptPaths.push(rel);
        result.tracksScanned++;
        workTracks++;
      }
      pruneTracksNotIn(workId, keptPaths);
      emit({ type: "tracks-done", workId, tracks: workTracks });

      const resolvedTitle =
        metadata?.title ?? existing?.title ?? undefined;
      emit({
        type: "work-done",
        workId,
        title: resolvedTitle,
        hasCover: Boolean(coverPath),
      });
    } catch (err) {
      const message = `${workId}: ${String(err)}`;
      result.errors.push(message);
      emit({ type: "error", workId, message });
    }
  }

  invalidateSearchIndex();
  emit({ type: "done", result });
  return result;
}
