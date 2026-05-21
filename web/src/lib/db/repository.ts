import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "./client";
import {
  circles,
  voiceActors,
  tags,
  works,
  workVoiceActors,
  workTags,
  tracks,
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
}

export function upsertWork({
  id,
  folderPath,
  metadata,
  coverPath,
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
    metadataSource: metadata?.source,
    lastScannedAt: new Date(),
    lastMetadataSyncAt: metadata ? new Date() : undefined,
  };

  const updateSet: Partial<NewWork> = {
    folderPath: values.folderPath,
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
