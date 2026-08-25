import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { extractWorkId, isArchiveFile } from "./metadata/types";
import { fetchMetadata, downloadCover, DlsiteUnavailableError } from "./metadata";
import {
  upsertWork,
  upsertTrack,
  pruneTracksNotIn,
  upsertAsset,
  pruneAssetsNotIn,
  markAssetsScanned,
  getWorkById,
  getWorkMetadataCounts,
  getAllWorkScanSnapshots,
} from "./db/repository";
import { classifyAsset } from "./assets/classify";
import { invalidateSearchIndex } from "./search/index-builder";
import { invalidateFilterListCache } from "./db/queries";
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
  | { type: "start"; total: number; libraryRoots: string[] }
  | {
      type: "work-start";
      workId: string;
      index: number;
      total: number;
      /** The work's folder, or its archive file when `isArchive`. */
      folder: string;
      hadExisting: boolean;
      isArchive: boolean;
    }
  | { type: "fetch-meta"; workId: string }
  | {
      type: "meta-retry";
      workId: string;
      attempt: number;
      delayMs: number;
      reason: string;
    }
  | { type: "meta-cooldown"; workId: string; delayMs: number }
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
  | { type: "assets-done"; workId: string; assets: number }
  | { type: "work-done"; workId: string; title?: string; hasCover: boolean }
  | { type: "error"; workId?: string; message: string }
  | { type: "durations-start"; total: number }
  | {
      type: "durations-track";
      index: number;
      total: number;
      workId: string;
      relativePath: string;
      durationSeconds?: number;
    }
  | { type: "durations-done"; updated: number; errors: number }
  | { type: "done"; result: ScanResult };

export interface ScanOptions {
  libraryRoots: string[];
  coversDir: string;
  forceMetadata?: boolean;
  /**
   * Walk every work's files, and never ask DLsite for anything.
   *
   * The counterpart to `forceMetadata`, for re-reading what is on disk. An
   * ordinary scan skips a work whose folder mtime has not moved, and that
   * check stats the work folder itself — which a new file dropped into
   * `おまけ/` or `台本/` does not touch, since only the immediate parent
   * directory's mtime changes. Those extras would otherwise stay invisible
   * until something forced a full rescan and re-fetched every listing.
   */
  skipMetadata?: boolean;
  /** If set, only scan works whose id is in this list. */
  filterIds?: ReadonlySet<string>;
  /** Backoff timings. Production uses the defaults; tests shrink them to 0. */
  retry?: { baseDelayMs?: number; cooldownMs?: number };
  onEvent?: (event: ScanEvent) => void;
}

export interface ScanResult {
  worksFound: number;
  worksNew: number;
  worksSkipped: number;
  tracksScanned: number;
  /** Non-audio extras recorded: illustrations, おまけ videos, 台本. */
  assetsScanned: number;
  metadataFetched: number;
  errors: string[];
  /** Set when DLsite went away and the run stopped early. */
  aborted?: boolean;
}

/** A minute is long enough for a rate-limit window or a blip to pass. */
const DLSITE_COOLDOWN_MS = 60_000;
/**
 * How many works in a row have to exhaust their retries before we call it an
 * outage rather than a run of bad ids.
 */
const DLSITE_UNAVAILABLE_STREAK = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

/** A work as found on disk: an extracted folder, or the archive holding it. */
export interface WorkEntry {
  path: string;
  isArchive: boolean;
}

/**
 * Records a discovery, letting an extracted folder win over an archive.
 *
 * A library in mid-unpack has both — the folder the user just extracted and
 * the .zip they haven't deleted yet. The folder is the one with playable
 * files, so it takes the slot regardless of which turned up first, and the
 * archive is dropped. Between two of the same kind the first still wins, so
 * root order keeps deciding duplicates.
 */
function recordEntry(
  found: Map<string, WorkEntry>,
  id: string,
  entry: WorkEntry,
): void {
  const existing = found.get(id);
  if (!existing || (existing.isArchive && !entry.isArchive)) {
    found.set(id, entry);
  }
}

async function findWorkEntries(root: string): Promise<Map<string, WorkEntry>> {
  const found = new Map<string, WorkEntry>();
  async function scan(dir: string, depth: number): Promise<void> {
    if (depth > 4) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isFile()) {
        if (!isArchiveFile(e.name)) continue;
        const id = extractWorkId(e.name);
        if (id) recordEntry(found, id, { path: full, isArchive: true });
        continue;
      }
      if (!e.isDirectory()) continue;
      const id = extractWorkId(e.name);
      if (id) {
        recordEntry(found, id, { path: full, isArchive: false });
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
    worksSkipped: 0,
    tracksScanned: 0,
    assetsScanned: 0,
    metadataFetched: 0,
    errors: [],
  };
  const emit = (e: ScanEvent) => opts.onEvent?.(e);

  const workEntries = new Map<string, WorkEntry>();
  if (opts.libraryRoots.length === 0) {
    const message = "No library roots configured";
    result.errors.push(message);
    emit({ type: "error", message });
    emit({ type: "done", result });
    return result;
  }
  for (const root of opts.libraryRoots) {
    try {
      const found = await findWorkEntries(root);
      for (const [id, entry] of found) {
        // First root that contains a work wins; later duplicates are skipped,
        // unless the duplicate is the extracted copy of an archive we already
        // have — see recordEntry.
        recordEntry(workEntries, id, entry);
      }
    } catch (err) {
      const message = `Failed to read library root ${root}: ${String(err)}`;
      result.errors.push(message);
      emit({ type: "error", message });
    }
  }

  if (opts.filterIds) {
    for (const id of workEntries.keys()) {
      if (!opts.filterIds.has(id)) workEntries.delete(id);
    }
  }

  result.worksFound = workEntries.size;

  // Quick-skip: for incremental scans (not forceMetadata, not filterIds),
  // drop works that are already fully indexed and whose folder mtime hasn't
  // advanced past lastScannedAt. Saves N sqlite lookups + the track walk per
  // up-to-date work. Bypassed when forceMetadata=true.
  // `skipMetadata` opts out too: re-reading the files is the entire point of
  // that mode, and the mtime check is exactly what hides a changed subfolder.
  const snapshots =
    !opts.forceMetadata && !opts.filterIds && !opts.skipMetadata
      ? getAllWorkScanSnapshots()
      : null;
  if (snapshots) {
    const toSkip: string[] = [];
    await Promise.all(
      Array.from(workEntries.entries()).map(async ([id, entry]) => {
        const snap = snapshots.get(id);
        if (!snap) return; // new work — must scan
        if (!snap.metadataSource || !snap.lastMetadataSyncAt) return;
        // HVDB is no longer a source, so its rows are due a DLsite refresh
        // even though they look complete.
        if (snap.metadataSource === "hvdb") return;
        if (snap.tagCount === 0) return;
        if (!snap.coverPath || !fsSync.existsSync(snap.coverPath)) return;
        if (!snap.lastScannedAt) return;
        // Indexed before extras existed. One re-walk backfills its assets and
        // stamps the column, after which this guard stops firing. Costs a
        // local directory walk — `needsMeta` stays false, so no network.
        if (!snap.assetsScannedAt) return;
        // Packed <-> extracted is a change the mtime check can miss: an
        // archive's own mtime predates the scan that first recorded it.
        if (snap.isArchive !== entry.isArchive) return;
        try {
          const st = await fs.stat(entry.path);
          if (st.mtimeMs > snap.lastScannedAt.getTime()) return;
        } catch {
          return;
        }
        toSkip.push(id);
      }),
    );
    for (const id of toSkip) workEntries.delete(id);
    result.worksSkipped = toSkip.length;
  }

  const total = workEntries.size;
  emit({ type: "start", total, libraryRoots: opts.libraryRoots });

  let index = 0;
  /** Consecutive works whose lookup ran out of retries. Reset by any answer. */
  let unavailableStreak = 0;
  for (const [workId, entry] of workEntries) {
    // The work's directory, or — for an archive entry — the container file.
    const workPath = entry.path;
    index++;
    try {
      const existing = getWorkById(workId);
      const counts = existing ? getWorkMetadataCounts(workId) : { tagCount: 0, voiceActorCount: 0 };
      const coverMissing =
        !existing?.coverPath || !fsSync.existsSync(existing.coverPath);
      const tagsMissing = counts.tagCount === 0;
      const needsMeta =
        !opts.skipMetadata &&
        (opts.forceMetadata ||
        !existing?.metadataSource ||
        // HVDB is gone as a source; anything it wrote is stale by definition,
        // so an ordinary incremental scan replaces it with DLsite's version.
        existing.metadataSource === "hvdb" ||
        !existing?.lastMetadataSyncAt ||
        coverMissing ||
        tagsMissing);

      emit({
        type: "work-start",
        workId,
        index,
        total,
        folder: workPath,
        hadExisting: Boolean(existing),
        isArchive: entry.isArchive,
      });

      let metadata = null;
      let coverPath = coverMissing ? undefined : existing?.coverPath ?? undefined;

      if (needsMeta) {
        emit({ type: "fetch-meta", workId });
        const attempt = () =>
          fetchMetadata(workId, {
            onRetry: (info) => emit({ type: "meta-retry", workId, ...info }),
            baseDelayMs: opts.retry?.baseDelayMs,
          });
        // Set when DLsite never answered, so the "nothing found" branch below
        // can say that instead of claiming the work doesn't exist.
        let unavailable: DlsiteUnavailableError | null = null;
        try {
          metadata = await attempt();
          unavailableStreak = 0;
        } catch (err) {
          if (!(err instanceof DlsiteUnavailableError)) throw err;
          unavailable = err;
          unavailableStreak++;

          // One work failing its retries is just a bad work — move on. Several
          // in a row means DLsite itself is gone, so wait out whatever it is
          // and give it exactly one more chance before stopping.
          if (unavailableStreak >= DLSITE_UNAVAILABLE_STREAK) {
            const cooldown = opts.retry?.cooldownMs ?? DLSITE_COOLDOWN_MS;
            emit({ type: "meta-cooldown", workId, delayMs: cooldown });
            await sleep(cooldown);
            try {
              metadata = await attempt();
              unavailable = null;
              unavailableStreak = 0;
            } catch (retryErr) {
              if (!(retryErr instanceof DlsiteUnavailableError)) throw retryErr;
              unavailable = retryErr;
              result.aborted = true;
            }
          }
        }

        if (result.aborted) {
          const message = `DLsite is unavailable — scan stopped at ${workId}: ${unavailable?.message}`;
          result.errors.push(message);
          emit({ type: "error", workId, message });
          // Record the row anyway so the folder isn't lost; its tracks and
          // metadata wait for the next run.
          upsertWork({
            id: workId,
            folderPath: workPath,
            metadata: null,
            coverPath,
            isArchive: entry.isArchive,
          });
          if (!existing) result.worksNew++;
          break;
        }

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
          const message = unavailable
            ? `DLsite did not answer for ${workId}: ${unavailable.message}`
            : `No metadata found for ${workId}`;
          result.errors.push(message);
          emit({ type: "error", workId, message });
        }
      } else {
        emit({ type: "meta-skipped", workId });
      }

      upsertWork({
        id: workId,
        folderPath: workPath,
        metadata,
        coverPath,
        isArchive: entry.isArchive,
      });
      if (!existing) result.worksNew++;

      if (entry.isArchive) {
        // Nothing to index inside the container, and nothing to prune either:
        // any tracks on record are from an earlier extracted copy, and pruning
        // them would cascade away their likes and playback progress and strand
        // their bookmarks. They cost nothing while the work is packed, and are
        // still there — matched by relative path — once it is unpacked again.
        //
        // Stamped as asset-scanned all the same. There is nothing to index
        // inside the container, and without this the quick-skip's
        // never-scanned guard would re-walk every archived work on every run.
        markAssetsScanned(workId);
        emit({
          type: "work-done",
          workId,
          title: metadata?.title ?? existing?.title ?? undefined,
          hasCover: Boolean(coverPath),
        });
        continue;
      }

      const keptPaths: string[] = [];
      const keptAssetPaths: string[] = [];
      let workTracks = 0;
      let workAssetCount = 0;
      for await (const filePath of walk(workPath)) {
        const ext = path.extname(filePath).toLowerCase();
        const rel = path.relative(workPath, filePath);
        const stat = await fs.stat(filePath).catch(() => null);

        if (AUDIO_EXTS.has(ext)) {
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
          continue;
        }

        // Everything else gets one shot at being an extra. `classifyAsset`
        // returns null for archives, OS junk and readmes; an empty file is
        // dropped here because nothing can be shown for it.
        const asset = classifyAsset(rel);
        if (!asset || !stat?.size) continue;
        upsertAsset({
          workId,
          kind: asset.kind,
          title: asset.title,
          relativePath: rel,
          extension: asset.extension,
          sizeBytes: stat.size,
          orderHint: asset.orderHint,
        });
        keptAssetPaths.push(rel);
        result.assetsScanned++;
        workAssetCount++;
      }
      pruneTracksNotIn(workId, keptPaths);
      pruneAssetsNotIn(workId, keptAssetPaths);
      markAssetsScanned(workId);
      emit({ type: "tracks-done", workId, tracks: workTracks });
      emit({ type: "assets-done", workId, assets: workAssetCount });

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
  invalidateFilterListCache();
  emit({ type: "done", result });
  return result;
}
