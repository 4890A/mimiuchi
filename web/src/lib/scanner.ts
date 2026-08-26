import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { fetchMetadata, downloadCover, DlsiteUnavailableError } from "./metadata";
import {
  AUDIO_EXTS,
  createDiscovery,
  discoverRoot,
  type WorkEntry,
} from "./discovery";
import {
  upsertWork,
  upsertTrack,
  pruneTracksNotIn,
  upsertAsset,
  pruneAssetsNotIn,
  markAssetsScanned,
  markWorksMissing,
  clearWorksMissing,
  listWorkIdsAndMissing,
  getWorkById,
  getWorkMetadataCounts,
  getAllWorkScanSnapshots,
} from "./db/repository";
import { classifyAsset } from "./assets/classify";
import { invalidateSearchIndex } from "./search/index-builder";
import { invalidateFilterListCache } from "./db/queries";
import fsSync from "node:fs";

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
  /** Nothing was marked missing: these roots could not be proven readable. */
  | { type: "roots-unverified"; roots: string[] }
  | {
      type: "missing-reconciled";
      marked: number;
      restored: number;
      total: number;
    }
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
  /**
   * Turn folders that carry no work id into works, titled from the folder.
   *
   * The user-facing setting, threaded all the way down: it decides discovery,
   * and it decides whether works already minted that way are still the
   * scanner's business — see `reconcileMissingWorks`.
   */
  includeUnmatchedFolders?: boolean;
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
  /** Works on record whose folder this scan could not find. */
  worksMissing: number;
  /** Of `worksFound`, how many were claimed by folder name rather than id. */
  worksManual: number;
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

/** Whether `dir` exists and can actually be listed, right now. */
async function isReadableDir(dir: string): Promise<boolean> {
  try {
    const st = await fs.stat(dir);
    if (!st.isDirectory()) return false;
    await fs.readdir(dir);
    return true;
  } catch {
    return false;
  }
}

/**
 * Is this work one nobody can look up?
 *
 * Two sources, because they answer at different moments: the entry knows
 * before anything is written, which is what keeps the very first scan of a new
 * folder from asking DLsite about `LOCAL-…`, and the stored source knows
 * afterwards, which covers a row whose folder the current settings no longer
 * claim.
 */
function isManualEntry(entry: WorkEntry, storedSource?: string | null): boolean {
  return entry.isManual === true || storedSource === "manual";
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
    worksMissing: 0,
    worksManual: 0,
    metadataFetched: 0,
    errors: [],
  };
  const emit = (e: ScanEvent) => opts.onEvent?.(e);
  const includeUnmatched = Boolean(opts.includeUnmatchedFolders);

  const discovery = createDiscovery();
  const workEntries = discovery.entries;
  if (opts.libraryRoots.length === 0) {
    const message = "No library roots configured";
    result.errors.push(message);
    emit({ type: "error", message });
    emit({ type: "done", result });
    return result;
  }
  // Roots that demonstrably listed content this run. A root missing from this
  // set is the reason nothing gets marked missing below — see `canTrustAbsence`.
  const verifiedRoots = new Set<string>();
  for (const root of opts.libraryRoots) {
    try {
      // First root that contains a work wins; later duplicates are skipped,
      // unless the duplicate is the extracted copy of an archive we already
      // have — see `recordEntry`. Manual entries count towards the tally too,
      // or a root holding nothing but hand-entered works would read as
      // unverified and suppress reconciliation for the whole library.
      const found = await discoverRoot(root, discovery, {
        includeUnmatched,
      });
      // `discoverRoot` swallows its own readdir failure and claims nothing, so
      // an unplugged drive arrives here looking exactly like a library the
      // user emptied. Ask the filesystem directly, and treat a root that lists
      // nothing as unproven either way — a reassigned drive letter reads as an
      // empty directory rather than failing outright.
      if (found > 0 && (await isReadableDir(root))) {
        verifiedRoots.add(root);
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
  for (const entry of workEntries.values()) {
    if (entry.isManual) result.worksManual++;
  }

  // Taken here on purpose. The quick-skip below deletes up-to-date works out
  // of `workEntries`, so anything comparing the database against that map
  // afterwards would conclude the whole healthy library had vanished.
  const foundIds = new Set(workEntries.keys());

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
        // A hand-entered work has no listing to be synced against, no cover
        // until someone uploads one and no tags until someone types them, so
        // three of the conditions below can never hold and it would be
        // re-walked on every scan forever. Its folder mtime is the only thing
        // that can tell us anything, and it is enough.
        if (!isManualEntry(entry, snap.metadataSource)) {
          if (!snap.metadataSource || !snap.lastMetadataSyncAt) return;
          // HVDB is no longer a source, so its rows are due a DLsite refresh
          // even though they look complete.
          if (snap.metadataSource === "hvdb") return;
          if (snap.tagCount === 0) return;
          if (!snap.coverPath || !fsSync.existsSync(snap.coverPath)) return;
        }
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
      const isManual = isManualEntry(entry, existing?.metadataSource);
      const needsMeta =
        // There is no listing behind a hand-entered work. Without this gate
        // `idVariants` passes `LOCAL-…` through verbatim, every scan burns a
        // 404 on it and pushes "No metadata found" into `result.errors` —
        // which is also what makes `pnpm scan` exit 1.
        !isManual &&
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
            isManual,
            fallbackTitle: isManual ? path.basename(workPath) : undefined,
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
        isManual,
        // Insert-only, so a rescan can never walk back a hand-edited title.
        fallbackTitle: isManual ? path.basename(workPath) : undefined,
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

  reconcileMissingWorks({
    foundIds,
    verifiedRoots,
    libraryRoots: opts.libraryRoots,
    partial: Boolean(opts.filterIds),
    includeUnmatched,
    result,
    emit,
  });

  invalidateSearchIndex();
  invalidateFilterListCache();
  emit({ type: "done", result });
  return result;
}

/**
 * Flags works whose folder this scan did not find, and unflags those that came
 * back.
 *
 * Every guard here exists to keep a temporarily unreachable drive from
 * emptying the library. Absence is only ever evidence of deletion when the
 * place the work should have been was itself readable.
 */
function reconcileMissingWorks({
  foundIds,
  verifiedRoots,
  libraryRoots,
  partial,
  includeUnmatched,
  result,
  emit,
}: {
  foundIds: ReadonlySet<string>;
  verifiedRoots: ReadonlySet<string>;
  libraryRoots: string[];
  partial: boolean;
  /** False means discovery never looked for manual works — see below. */
  includeUnmatched: boolean;
  result: ScanResult;
  emit: (e: ScanEvent) => void;
}): void {
  // A filtered scan only looked at some of the library; the works it never
  // visited are absent from `foundIds` for reasons that have nothing to do
  // with the disk.
  if (partial) return;

  const unverified = libraryRoots.filter((r) => !verifiedRoots.has(r));
  if (unverified.length > 0) {
    emit({ type: "roots-unverified", roots: unverified });
    return;
  }

  // With the setting off, discovery did not go looking for hand-entered works,
  // so their absence from `foundIds` says nothing about the disk. Leaving them
  // in would flag every one of them missing and offer them all up for deletion
  // in Settings — for the crime of unticking a checkbox. A work you typed in
  // by hand is simply not the scanner's business while it is off.
  const known = listWorkIdsAndMissing().filter(
    (w) => includeUnmatched || w.metadataSource !== "manual",
  );
  const gone = known.filter((w) => !foundIds.has(w.id) && !w.missing);
  const back = known.filter((w) => foundIds.has(w.id) && w.missing);

  markWorksMissing(gone.map((w) => w.id), new Date());
  clearWorksMissing(back.map((w) => w.id));

  result.worksMissing = known.filter((w) => !foundIds.has(w.id)).length;
  if (gone.length > 0 || back.length > 0) {
    emit({
      type: "missing-reconciled",
      marked: gone.length,
      restored: back.length,
      total: result.worksMissing,
    });
  }
}
