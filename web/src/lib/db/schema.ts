import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const circles = sqliteTable("circles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  nameEn: text("name_en"),
});

export const voiceActors = sqliteTable(
  "voice_actors",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull().unique(),
    nameEn: text("name_en"),
  },
  (t) => [index("voice_actors_name_idx").on(t.name)],
);

export const tags = sqliteTable(
  "tags",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull().unique(),
    nameEn: text("name_en"),
    category: text("category"),
  },
  (t) => [index("tags_name_idx").on(t.name)],
);

export const works = sqliteTable(
  "works",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    titleKana: text("title_kana"),
    circleId: integer("circle_id").references(() => circles.id),
    releaseDate: text("release_date"),
    ageRating: text("age_rating"),
    language: text("language"),
    workType: text("work_type"),
    description: text("description"),
    coverUrl: text("cover_url"),
    coverPath: text("cover_path"),
    dlsiteUrl: text("dlsite_url"),
    nsfw: integer("nsfw", { mode: "boolean" }).notNull().default(false),
    folderPath: text("folder_path").notNull(),
    metadataSource: text("metadata_source"),
    lastScannedAt: integer("last_scanned_at", { mode: "timestamp_ms" }),
    lastMetadataSyncAt: integer("last_metadata_sync_at", {
      mode: "timestamp_ms",
    }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    index("works_circle_idx").on(t.circleId),
    index("works_title_idx").on(t.title),
    uniqueIndex("works_folder_idx").on(t.folderPath),
  ],
);

export const workVoiceActors = sqliteTable(
  "work_voice_actors",
  {
    workId: text("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "cascade" }),
    voiceActorId: integer("voice_actor_id")
      .notNull()
      .references(() => voiceActors.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.workId, t.voiceActorId] }),
    index("wva_va_idx").on(t.voiceActorId),
  ],
);

export const workTags = sqliteTable(
  "work_tags",
  {
    workId: text("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.workId, t.tagId] }),
    index("wt_tag_idx").on(t.tagId),
  ],
);

export const tracks = sqliteTable(
  "tracks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workId: text("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    relativePath: text("relative_path").notNull(),
    extension: text("extension").notNull(),
    sizeBytes: integer("size_bytes"),
    durationSeconds: real("duration_seconds"),
    trackNumber: integer("track_number"),
    discNumber: integer("disc_number"),
  },
  (t) => [
    index("tracks_work_idx").on(t.workId),
    uniqueIndex("tracks_path_idx").on(t.workId, t.relativePath),
  ],
);

export const likes = sqliteTable("likes", {
  trackId: integer("track_id")
    .primaryKey()
    .references(() => tracks.id, { onDelete: "cascade" }),
  likedAt: integer("liked_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const trackProgress = sqliteTable("track_progress", {
  trackId: integer("track_id")
    .primaryKey()
    .references(() => tracks.id, { onDelete: "cascade" }),
  positionSeconds: real("position_seconds").notNull(),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type Work = typeof works.$inferSelect;
export type NewWork = typeof works.$inferInsert;
export type Track = typeof tracks.$inferSelect;
export type NewTrack = typeof tracks.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type VoiceActor = typeof voiceActors.$inferSelect;
export type Circle = typeof circles.$inferSelect;
