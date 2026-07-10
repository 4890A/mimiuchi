import "server-only";
import fs from "node:fs";
import { eq, desc, sql, asc, inArray, and } from "drizzle-orm";
import { db, sqlite } from "./client";
import { searchWorkIdsForQuery } from "../search/index-builder";
import {
  works,
  circles,
  voiceActors,
  tags,
  workVoiceActors,
  workTags,
  tracks,
  likes,
  trackProgress,
} from "./schema";

export interface WorkSummary {
  id: string;
  title: string;
  circleName: string | null;
  coverUrl: string | null;
  hasLocalCover: boolean;
  voiceActors: { id: number; name: string }[];
  tags: { id: number; name: string }[];
  releaseDate: string | null;
  nsfw: boolean;
}

export interface LibraryFilters {
  q?: string;
  tagIds?: number[];
  voiceActorIds?: number[];
  circleIds?: number[];
  sort?: "title" | "release" | "added";
  dir?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export async function listWorksFiltered(
  f: LibraryFilters = {},
): Promise<WorkSummary[]> {
  const conds = [];
  let relevanceOrder: string[] | null = null;
  if (f.q && f.q.trim()) {
    relevanceOrder = await searchWorkIdsForQuery(f.q.trim(), 1000);
    if (relevanceOrder.length === 0) return [];
    conds.push(inArray(works.id, relevanceOrder));
  }
  if (f.circleIds && f.circleIds.length)
    conds.push(inArray(works.circleId, f.circleIds));

  let baseQuery = db
    .select({
      id: works.id,
      title: works.title,
      circleName: circles.name,
      coverUrl: works.coverUrl,
      coverPath: works.coverPath,
      releaseDate: works.releaseDate,
      nsfw: works.nsfw,
      createdAt: works.createdAt,
    })
    .from(works)
    .leftJoin(circles, eq(works.circleId, circles.id))
    .$dynamic();

  if (conds.length > 0) baseQuery = baseQuery.where(and(...conds));

  const useRelevance = relevanceOrder !== null && !f.sort;
  if (!useRelevance) {
    const defaultDir: "asc" | "desc" = f.sort === "title" ? "asc" : "desc";
    const dir = f.dir ?? defaultDir;
    const order = dir === "asc" ? asc : desc;
    if (f.sort === "title") baseQuery = baseQuery.orderBy(order(works.title));
    else if (f.sort === "release")
      baseQuery = baseQuery.orderBy(order(works.releaseDate));
    else baseQuery = baseQuery.orderBy(order(works.createdAt));

    if (f.limit) baseQuery = baseQuery.limit(f.limit);
    if (f.offset) baseQuery = baseQuery.offset(f.offset);
  }

  let rows = baseQuery.all();

  if (useRelevance && relevanceOrder) {
    const rank = new Map<string, number>();
    relevanceOrder.forEach((id, i) => rank.set(id, i));
    rows.sort(
      (a, b) =>
        (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity),
    );
  }

  if (f.tagIds && f.tagIds.length) {
    const matches = db
      .select({ workId: workTags.workId })
      .from(workTags)
      .where(inArray(workTags.tagId, f.tagIds))
      .groupBy(workTags.workId)
      .having(sql`count(*) = ${f.tagIds.length}`)
      .all();
    const ids = new Set(matches.map((m) => m.workId));
    rows = rows.filter((r) => ids.has(r.id));
  }
  if (f.voiceActorIds && f.voiceActorIds.length) {
    const matches = db
      .select({ workId: workVoiceActors.workId })
      .from(workVoiceActors)
      .where(inArray(workVoiceActors.voiceActorId, f.voiceActorIds))
      .all();
    const ids = new Set(matches.map((m) => m.workId));
    rows = rows.filter((r) => ids.has(r.id));
  }

  if (useRelevance && f.limit) {
    rows = rows.slice(f.offset ?? 0, (f.offset ?? 0) + f.limit);
  }

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const vaRows = db
    .select({
      workId: workVoiceActors.workId,
      id: voiceActors.id,
      name: voiceActors.name,
    })
    .from(workVoiceActors)
    .innerJoin(voiceActors, eq(workVoiceActors.voiceActorId, voiceActors.id))
    .where(inArray(workVoiceActors.workId, ids))
    .all();
  const vaByWork = new Map<string, { id: number; name: string }[]>();
  for (const r of vaRows) {
    const list = vaByWork.get(r.workId) ?? [];
    list.push({ id: r.id, name: r.name });
    vaByWork.set(r.workId, list);
  }

  const tagRows = db
    .select({
      workId: workTags.workId,
      id: tags.id,
      name: tags.name,
    })
    .from(workTags)
    .innerJoin(tags, eq(workTags.tagId, tags.id))
    .where(inArray(workTags.workId, ids))
    .all();
  const tagsByWork = new Map<string, { id: number; name: string }[]>();
  for (const r of tagRows) {
    const list = tagsByWork.get(r.workId) ?? [];
    list.push({ id: r.id, name: r.name });
    tagsByWork.set(r.workId, list);
  }

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    circleName: r.circleName ?? null,
    coverUrl: r.coverUrl ?? null,
    hasLocalCover: Boolean(r.coverPath),
    voiceActors: vaByWork.get(r.id) ?? [],
    tags: tagsByWork.get(r.id) ?? [],
    releaseDate: r.releaseDate ?? null,
    nsfw: r.nsfw,
  }));
}

export function getWorkDetail(workId: string) {
  const work = db
    .select({
      id: works.id,
      title: works.title,
      titleKana: works.titleKana,
      description: works.description,
      releaseDate: works.releaseDate,
      ageRating: works.ageRating,
      workType: works.workType,
      language: works.language,
      coverUrl: works.coverUrl,
      coverPath: works.coverPath,
      dlsiteUrl: works.dlsiteUrl,
      nsfw: works.nsfw,
      circleName: circles.name,
      circleId: circles.id,
    })
    .from(works)
    .leftJoin(circles, eq(works.circleId, circles.id))
    .where(eq(works.id, workId))
    .get();

  if (!work) return null;

  const trackRows = db
    .select()
    .from(tracks)
    .where(eq(tracks.workId, workId))
    .orderBy(asc(tracks.trackNumber), asc(tracks.relativePath))
    .all();

  const trackIds = trackRows.map((t) => t.id);
  const liked = trackIds.length
    ? new Set(
        db
          .select({ id: likes.trackId })
          .from(likes)
          .where(inArray(likes.trackId, trackIds))
          .all()
          .map((r) => r.id),
      )
    : new Set<number>();

  const progress = trackIds.length
    ? new Map(
        db
          .select()
          .from(trackProgress)
          .where(inArray(trackProgress.trackId, trackIds))
          .all()
          .map((r) => [r.trackId, r]),
      )
    : new Map();

  const vas = db
    .select({ id: voiceActors.id, name: voiceActors.name, nameEn: voiceActors.nameEn })
    .from(workVoiceActors)
    .innerJoin(voiceActors, eq(workVoiceActors.voiceActorId, voiceActors.id))
    .where(eq(workVoiceActors.workId, workId))
    .all();

  const workTagsRows = db
    .select({ name: tags.name, nameEn: tags.nameEn, id: tags.id })
    .from(workTags)
    .innerJoin(tags, eq(workTags.tagId, tags.id))
    .where(eq(workTags.workId, workId))
    .all();

  // mtime of the local cover file, used as a cache-busting token so the
  // browser refetches /api/cover after an in-app cover replacement despite
  // the route's immutable Cache-Control.
  let coverVersion: number | undefined;
  if (work.coverPath) {
    try {
      coverVersion = Math.floor(fs.statSync(work.coverPath).mtimeMs);
    } catch {
      // cover file gone; fall through with no version
    }
  }

  return {
    ...work,
    coverVersion,
    voiceActors: vas,
    tags: workTagsRows,
    tracks: trackRows.map((t) => ({
      ...t,
      liked: liked.has(t.id),
      progress: progress.get(t.id) ?? null,
    })),
  };
}

type TagRow = { id: number; name: string; nameEn: string | null; workCount: number };
type VARow = { id: number; name: string; nameEn: string | null; workCount: number };
type CircleRow = { id: number; name: string; nameEn: string | null; workCount: number };

/** No-op retained for call sites. These filter lists used to be memoized in
 *  module-level variables, but the library scan runs in an API route handler
 *  whose module instance is separate from the RSC pages' — so invalidating the
 *  cache there never reached the copy the /seiyuu, filter, and home pages read,
 *  leaving them stale (empty) until a server restart. The queries below are
 *  single indexed GROUP BYs, so we just run them fresh per request instead. */
export function invalidateFilterListCache() {}

export function listAllTags(): TagRow[] {
  return db
    .select({
      id: tags.id,
      name: tags.name,
      nameEn: tags.nameEn,
      workCount: sql<number>`count(${workTags.workId})`.as("c"),
    })
    .from(tags)
    .leftJoin(workTags, eq(workTags.tagId, tags.id))
    .groupBy(tags.id)
    .orderBy(desc(sql`c`))
    .all();
}

export function listAllVoiceActors(): VARow[] {
  return db
    .select({
      id: voiceActors.id,
      name: voiceActors.name,
      nameEn: voiceActors.nameEn,
      workCount: sql<number>`count(${workVoiceActors.workId})`.as("c"),
    })
    .from(voiceActors)
    .leftJoin(workVoiceActors, eq(workVoiceActors.voiceActorId, voiceActors.id))
    .groupBy(voiceActors.id)
    .orderBy(desc(sql`c`))
    .all();
}

export function listAllCircles(): CircleRow[] {
  return db
    .select({
      id: circles.id,
      name: circles.name,
      nameEn: sql<string | null>`null`.as("name_en"),
      workCount: sql<number>`count(${works.id})`.as("c"),
    })
    .from(circles)
    .leftJoin(works, eq(works.circleId, circles.id))
    .groupBy(circles.id)
    .orderBy(desc(sql`c`))
    .all();
}

export interface CircleWithRecentWorks {
  id: number;
  name: string;
  workCount: number;
  recentWorks: {
    id: string;
    title: string;
    coverUrl: string | null;
    hasLocalCover: boolean;
    nsfw: boolean;
  }[];
}

export function listAllCirclesWithRecentWorks(): CircleWithRecentWorks[] {
  const circleRows = db
    .select({
      id: circles.id,
      name: circles.name,
      workCount: sql<number>`count(${works.id})`.as("c"),
    })
    .from(circles)
    .leftJoin(works, eq(works.circleId, circles.id))
    .groupBy(circles.id)
    .orderBy(desc(sql`c`))
    .all();

  const recentRows = sqlite
    .prepare(
      `SELECT circle_id AS circleId, id, title, cover_url AS coverUrl, cover_path AS coverPath, nsfw
       FROM (
         SELECT w.*, ROW_NUMBER() OVER (
           PARTITION BY w.circle_id
           ORDER BY COALESCE(w.release_date, '') DESC, w.created_at DESC
         ) AS rn
         FROM works w
         WHERE w.circle_id IS NOT NULL
       )
       WHERE rn <= 4`,
    )
    .all() as Array<{
    circleId: number;
    id: string;
    title: string;
    coverUrl: string | null;
    coverPath: string | null;
    nsfw: number;
  }>;

  const byCircle = new Map<number, CircleWithRecentWorks["recentWorks"]>();
  for (const r of recentRows) {
    const arr = byCircle.get(r.circleId) ?? [];
    arr.push({
      id: r.id,
      title: r.title,
      coverUrl: r.coverUrl,
      hasLocalCover: Boolean(r.coverPath),
      nsfw: Boolean(r.nsfw),
    });
    byCircle.set(r.circleId, arr);
  }

  return circleRows.map((c) => ({
    id: c.id,
    name: c.name,
    workCount: c.workCount,
    recentWorks: byCircle.get(c.id) ?? [],
  }));
}

export interface RecentWork {
  id: string;
  title: string;
  circleName: string | null;
  coverUrl: string | null;
  hasLocalCover: boolean;
  nsfw: boolean;
  lastPlayedAt: number;
}

export function listRecentlyPlayedWorks(limit = 8): RecentWork[] {
  const rows = db
    .select({
      id: works.id,
      title: works.title,
      circleName: circles.name,
      coverUrl: works.coverUrl,
      coverPath: works.coverPath,
      nsfw: works.nsfw,
      lastPlayedAt: sql<number>`max(${trackProgress.updatedAt})`.as("last_played_at"),
    })
    .from(trackProgress)
    .innerJoin(tracks, eq(trackProgress.trackId, tracks.id))
    .innerJoin(works, eq(tracks.workId, works.id))
    .leftJoin(circles, eq(works.circleId, circles.id))
    .groupBy(works.id)
    .orderBy(desc(sql`last_played_at`))
    .limit(limit)
    .all();

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    circleName: r.circleName ?? null,
    coverUrl: r.coverUrl ?? null,
    hasLocalCover: Boolean(r.coverPath),
    nsfw: r.nsfw,
    lastPlayedAt: r.lastPlayedAt,
  }));
}

export function listRandomWorks(limit = 8): RecentWork[] {
  const rows = db
    .select({
      id: works.id,
      title: works.title,
      circleName: circles.name,
      coverUrl: works.coverUrl,
      coverPath: works.coverPath,
      nsfw: works.nsfw,
    })
    .from(works)
    .leftJoin(circles, eq(works.circleId, circles.id))
    .orderBy(sql`RANDOM()`)
    .limit(limit)
    .all();

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    circleName: r.circleName ?? null,
    coverUrl: r.coverUrl ?? null,
    hasLocalCover: Boolean(r.coverPath),
    nsfw: r.nsfw,
    lastPlayedAt: 0,
  }));
}

export function listLikedTracks() {
  return db
    .select({
      trackId: tracks.id,
      title: tracks.title,
      relativePath: tracks.relativePath,
      durationSeconds: tracks.durationSeconds,
      workId: tracks.workId,
      workTitle: works.title,
      coverUrl: works.coverUrl,
      coverPath: works.coverPath,
      circleName: circles.name,
      likedAt: likes.likedAt,
    })
    .from(likes)
    .innerJoin(tracks, eq(likes.trackId, tracks.id))
    .innerJoin(works, eq(tracks.workId, works.id))
    .leftJoin(circles, eq(works.circleId, circles.id))
    .orderBy(desc(likes.likedAt))
    .all();
}
