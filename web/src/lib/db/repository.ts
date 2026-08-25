import "server-only";
import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "./client";
import {
  circles,
  voiceActors,
  tags,
  works,
  workVoiceActors,
  workTags,
  tracks,
  trackWaveforms,
  workAssets,
  type NewWork,
  type NewTrack,
} from "./schema";
import type { NormalizedWork } from "../metadata/types";

function upsertCircle(name: string, nameEn?: string): number {
  const existing = db.select().from(circles).where(eq(circles.name, name)).get();
  if (existing) {
    if (nameEn && existing.nameEn !== nameEn) {
      db.update(circles).set({ nameEn }).where(eq(circles.id, existing.id)).run();
    }
    return existing.id;
  }
  const inserted = db
    .insert(circles)
    .values({ name, nameEn })
    .returning({ id: circles.id })
    .get();
  return inserted.id;
}

function upsertVoiceActor(name: string, nameEn?: string): number {
  const existing = db
    .select()
    .from(voiceActors)
    .where(eq(voiceActors.name, name))
    .get();
  if (existing) {
    if (nameEn && existing.nameEn !== nameEn) {
      db.update(voiceActors)
        .set({ nameEn })
        .where(eq(voiceActors.id, existing.id))
        .run();
    }
    return existing.id;
  }
  const inserted = db
    .insert(voiceActors)
    .values({ name, nameEn })
    .returning({ id: voiceActors.id })
    .get();
  return inserted.id;
}

function upsertTag(
  name: string,
  nameEn?: string,
  category?: string,
): number {
  const existing = db.select().from(tags).where(eq(tags.name, name)).get();
  if (existing) {
    if (nameEn && existing.nameEn !== nameEn) {
      db.update(tags).set({ nameEn }).where(eq(tags.id, existing.id)).run();
    }
    return existing.id;
  }
  const inserted = db
    .insert(tags)
    .values({ name, nameEn, category })
    .returning({ id: tags.id })
    .get();
  return inserted.id;
}

export interface UpsertWorkInput {
  id: string;
  folderPath: string;
  metadata?: NormalizedWork | null;
  coverPath?: string;
  /** `folderPath` points at an archive file rather than an extracted folder. */
  isArchive?: boolean;
}

export function upsertWork({
  id,
  folderPath,
  metadata,
  coverPath,
  isArchive = false,
}: UpsertWorkInput): void {
  const circleId = metadata?.circleName
    ? upsertCircle(metadata.circleName, metadata.circleNameEn)
    : undefined;

  const values: NewWork = {
    id,
    title: metadata?.title ?? id,
    titleKana: metadata?.titleKana,
    circleId,
    releaseDate: metadata?.releaseDate,
    ageRating: metadata?.ageRating,
    language: metadata?.language,
    workType: metadata?.workType,
    description: metadata?.description,
    coverUrl: metadata?.coverUrl,
    coverPath,
    dlsiteUrl: metadata?.dlsiteUrl,
    nsfw: metadata?.nsfw ?? false,
    folderPath,
    isArchive,
    metadataSource: metadata?.source,
    lastScannedAt: new Date(),
    lastMetadataSyncAt: metadata ? new Date() : undefined,
  };

  // folderPath and isArchive move together and are rewritten on every scan,
  // metadata or not: they are what tells an extracted work from one that is
  // still packed, and a work flips between the two as the user unpacks it.
  const updateSet: Partial<NewWork> = {
    folderPath: values.folderPath,
    isArchive: values.isArchive,
    lastScannedAt: values.lastScannedAt,
  };
  if (metadata) {
    updateSet.title = values.title;
    updateSet.titleKana = values.titleKana;
    updateSet.circleId = values.circleId;
    updateSet.releaseDate = values.releaseDate;
    updateSet.ageRating = values.ageRating;
    updateSet.workType = values.workType;
    updateSet.description = values.description;
    updateSet.coverUrl = values.coverUrl;
    updateSet.dlsiteUrl = values.dlsiteUrl;
    updateSet.nsfw = values.nsfw;
    updateSet.metadataSource = values.metadataSource;
    updateSet.lastMetadataSyncAt = values.lastMetadataSyncAt;
  }
  if (coverPath) updateSet.coverPath = coverPath;

  db.insert(works)
    .values(values)
    .onConflictDoUpdate({
      target: works.id,
      set: updateSet,
    })
    .run();

  if (metadata) {
    db.delete(workVoiceActors).where(eq(workVoiceActors.workId, id)).run();
    for (const va of metadata.voiceActors) {
      const vaId = upsertVoiceActor(va.name, va.nameEn);
      db.insert(workVoiceActors)
        .values({ workId: id, voiceActorId: vaId })
        .onConflictDoNothing()
        .run();
    }

    db.delete(workTags).where(eq(workTags.workId, id)).run();
    for (const t of metadata.tags) {
      const tagId = upsertTag(t.name, t.nameEn, t.category);
      db.insert(workTags)
        .values({ workId: id, tagId })
        .onConflictDoNothing()
        .run();
    }
  }
}

export interface UpsertTrackInput {
  workId: string;
  title: string;
  relativePath: string;
  extension: string;
  sizeBytes?: number;
  trackNumber?: number;
  discNumber?: number;
}

export function upsertTrack(input: UpsertTrackInput): void {
  const values: NewTrack = input;
  db.insert(tracks)
    .values(values)
    .onConflictDoUpdate({
      target: [tracks.workId, tracks.relativePath],
      set: {
        title: values.title,
        extension: values.extension,
        sizeBytes: values.sizeBytes,
        trackNumber: values.trackNumber,
        discNumber: values.discNumber,
      },
    })
    .run();
}

export interface UpsertAssetInput {
  workId: string;
  kind: string;
  title: string;
  relativePath: string;
  extension: string;
  sizeBytes?: number;
  orderHint?: number | null;
}

export function upsertAsset(input: UpsertAssetInput): void {
  db.insert(workAssets)
    .values({ ...input, orderHint: input.orderHint ?? null })
    .onConflictDoUpdate({
      target: [workAssets.workId, workAssets.relativePath],
      set: {
        kind: input.kind,
        title: input.title,
        extension: input.extension,
        sizeBytes: input.sizeBytes,
        orderHint: input.orderHint ?? null,
      },
    })
    .run();
}

export function pruneAssetsNotIn(
  workId: string,
  keptRelativePaths: string[],
): void {
  const existing = db
    .select({ id: workAssets.id, relativePath: workAssets.relativePath })
    .from(workAssets)
    .where(eq(workAssets.workId, workId))
    .all();
  const keep = new Set(keptRelativePaths);
  const toDelete = existing
    .filter((a) => !keep.has(a.relativePath))
    .map((a) => a.id);
  if (toDelete.length > 0) {
    db.delete(workAssets).where(inArray(workAssets.id, toDelete)).run();
  }
}

/**
 * Flags works whose folder a scan could not find, leaving every other column
 * alone. Rows already flagged keep their original timestamp, so the value
 * records when the folder first went missing rather than the last scan.
 */
export function markWorksMissing(ids: string[], at: Date): void {
  if (ids.length === 0) return;
  db.update(works)
    .set({ missingSince: at })
    .where(and(inArray(works.id, ids), isNull(works.missingSince)))
    .run();
}

/** Clears the flag on works that turned up again — a re-plugged drive heals. */
export function clearWorksMissing(ids: string[]): void {
  if (ids.length === 0) return;
  db.update(works)
    .set({ missingSince: null })
    .where(and(inArray(works.id, ids), isNotNull(works.missingSince)))
    .run();
}

/** Every work id with whether it is currently flagged missing. Cheap enough to
 *  pull whole — the scanner needs the full set to diff against the disk. */
export function listWorkIdsAndMissing(): Array<{ id: string; missing: boolean }> {
  return db
    .select({ id: works.id, missingSince: works.missingSince })
    .from(works)
    .all()
    .map((r) => ({ id: r.id, missing: r.missingSince !== null }));
}

export interface MissingWork {
  id: string;
  title: string;
  folderPath: string;
  missingSince: Date | null;
}

export function listMissingWorks(): MissingWork[] {
  return db
    .select({
      id: works.id,
      title: works.title,
      folderPath: works.folderPath,
      missingSince: works.missingSince,
    })
    .from(works)
    .where(isNotNull(works.missingSince))
    .orderBy(asc(works.title))
    .all();
}

/** Stamps the work as asset-scanned so the quick-skip stops re-walking it. */
export function markAssetsScanned(workId: string): void {
  db.update(works)
    .set({ assetsScannedAt: new Date() })
    .where(eq(works.id, workId))
    .run();
}

export function getAssetSourceFile(
  id: number,
): { folderPath: string; relativePath: string; extension: string } | undefined {
  return db
    .select({
      folderPath: works.folderPath,
      relativePath: workAssets.relativePath,
      extension: workAssets.extension,
    })
    .from(workAssets)
    .innerJoin(works, eq(works.id, workAssets.workId))
    .where(eq(workAssets.id, id))
    .get();
}

export function listTracksMissingDuration(): Array<{
  id: number;
  workId: string;
  folderPath: string;
  relativePath: string;
}> {
  return db
    .select({
      id: tracks.id,
      workId: tracks.workId,
      folderPath: works.folderPath,
      relativePath: tracks.relativePath,
    })
    .from(tracks)
    .innerJoin(works, eq(works.id, tracks.workId))
    .where(sql`${tracks.durationSeconds} IS NULL`)
    .all();
}

export function listAllTracksForDuration(): Array<{
  id: number;
  workId: string;
  folderPath: string;
  relativePath: string;
}> {
  return db
    .select({
      id: tracks.id,
      workId: tracks.workId,
      folderPath: works.folderPath,
      relativePath: tracks.relativePath,
    })
    .from(tracks)
    .innerJoin(works, eq(works.id, tracks.workId))
    .all();
}

export function setTrackDuration(id: number, durationSeconds: number): void {
  db.update(tracks).set({ durationSeconds }).where(eq(tracks.id, id)).run();
}

export function getTrackSourceFile(
  id: number,
): { folderPath: string; relativePath: string } | undefined {
  return db
    .select({
      folderPath: works.folderPath,
      relativePath: tracks.relativePath,
    })
    .from(tracks)
    .innerJoin(works, eq(works.id, tracks.workId))
    .where(eq(tracks.id, id))
    .get();
}

export function getTrackWaveform(
  trackId: number,
): { version: number; buckets: number; peaks: Buffer } | undefined {
  return db
    .select({
      version: trackWaveforms.version,
      buckets: trackWaveforms.buckets,
      peaks: trackWaveforms.peaks,
    })
    .from(trackWaveforms)
    .where(eq(trackWaveforms.trackId, trackId))
    .get();
}

export function setTrackWaveform(
  trackId: number,
  version: number,
  buckets: number,
  peaks: Buffer,
): void {
  db.insert(trackWaveforms)
    .values({ trackId, version, buckets, peaks, createdAt: new Date() })
    .onConflictDoUpdate({
      target: trackWaveforms.trackId,
      set: { version, buckets, peaks, createdAt: new Date() },
    })
    .run();
}

export function pruneTracksNotIn(
  workId: string,
  keptRelativePaths: string[],
): void {
  const existing = db
    .select({ id: tracks.id, relativePath: tracks.relativePath })
    .from(tracks)
    .where(eq(tracks.workId, workId))
    .all();
  const keep = new Set(keptRelativePaths);
  const toDelete = existing.filter((t) => !keep.has(t.relativePath)).map((t) => t.id);
  if (toDelete.length > 0) {
    db.delete(tracks).where(inArray(tracks.id, toDelete)).run();
  }
}

export function getWorkById(id: string) {
  return db.select().from(works).where(eq(works.id, id)).get();
}

export function getWorkMetadataCounts(id: string): {
  tagCount: number;
  voiceActorCount: number;
} {
  const tagCount = db
    .select({ id: workTags.tagId })
    .from(workTags)
    .where(eq(workTags.workId, id))
    .all().length;
  const voiceActorCount = db
    .select({ id: workVoiceActors.voiceActorId })
    .from(workVoiceActors)
    .where(eq(workVoiceActors.workId, id))
    .all().length;
  return { tagCount, voiceActorCount };
}

export function listWorks() {
  return db.select().from(works).all();
}

export interface WorkScanSnapshot {
  metadataSource: string | null;
  lastMetadataSyncAt: Date | null;
  lastScannedAt: Date | null;
  coverPath: string | null;
  tagCount: number;
  isArchive: boolean;
  /** NULL on works indexed before assets existed — forces one re-walk. */
  assetsScannedAt: Date | null;
}

/** Bulk-load the per-work fields the scanner needs to decide whether a work
 *  is already fully indexed. Avoids N queries during incremental scans. */
export function getAllWorkScanSnapshots(): Map<string, WorkScanSnapshot> {
  const rows = db
    .select({
      id: works.id,
      metadataSource: works.metadataSource,
      lastMetadataSyncAt: works.lastMetadataSyncAt,
      lastScannedAt: works.lastScannedAt,
      coverPath: works.coverPath,
      isArchive: works.isArchive,
      assetsScannedAt: works.assetsScannedAt,
      tagCount: sql<number>`(SELECT COUNT(*) FROM work_tags WHERE work_tags.work_id = ${works.id})`.as("tag_count"),
    })
    .from(works)
    .all();
  const out = new Map<string, WorkScanSnapshot>();
  for (const r of rows) {
    out.set(r.id, {
      metadataSource: r.metadataSource,
      lastMetadataSyncAt: r.lastMetadataSyncAt,
      lastScannedAt: r.lastScannedAt,
      coverPath: r.coverPath,
      tagCount: r.tagCount,
      isArchive: r.isArchive,
      assetsScannedAt: r.assetsScannedAt,
    });
  }
  return out;
}

export function listWorkIdsMissingSeiyuu(): string[] {
  const rows = db
    .select({ id: works.id })
    .from(works)
    .leftJoin(workVoiceActors, eq(workVoiceActors.workId, works.id))
    .groupBy(works.id)
    .having(sql`COUNT(${workVoiceActors.voiceActorId}) = 0`)
    .all();
  return rows.map((r) => r.id);
}
