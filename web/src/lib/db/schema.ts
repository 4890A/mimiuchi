import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  real,
  blob,
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
    /** Where the work lives on disk: its directory, or — when `isArchive` —
     *  the .zip/.rar/.7z file it is still packed in. */
    folderPath: text("folder_path").notNull(),
    /** The work was found only as an archive, so it has no playable tracks
     *  yet. Cleared by the next scan that finds an extracted folder for it. */
    isArchive: integer("is_archive", { mode: "boolean" })
      .notNull()
      .default(false),
    metadataSource: text("metadata_source"),
    lastScannedAt: integer("last_scanned_at", { mode: "timestamp_ms" }),
    /** When the work's non-audio files were last indexed into `work_assets`.
     *  NULL on every row that predates asset scanning, which is what makes the
     *  scanner walk each existing work exactly once to backfill it. */
    assetsScannedAt: integer("assets_scanned_at", { mode: "timestamp_ms" }),
    /**
     * When a scan last found this work's folder absent, or NULL while it is
     * present. Marked rather than deleted: an unplugged drive looks exactly
     * like a deleted library from the filesystem's side, and a flag is
     * recoverable where a cascade delete would take likes, playback progress
     * and tags with it. Cleared automatically when the folder reappears.
     */
    missingSince: integer("missing_since", { mode: "timestamp_ms" }),
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

/**
 * A non-audio file that ships alongside a work: an illustration, an おまけ
 * video, a 台本 (script). Readmes are filtered out at scan time and never
 * reach this table — see `lib/assets/classify.ts`.
 *
 * Deliberately separate from `tracks`. Non-audio rows in `tracks` would be fed
 * to `music-metadata` by the duration pass, served by the audio route's MIME
 * map, and referenced by the `likes` / `track_progress` / `track_waveforms`
 * foreign keys — none of which make sense for a PDF.
 */
export const workAssets = sqliteTable(
  "work_assets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workId: text("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "cascade" }),
    /** One of AssetKind: script | image | video | text | other. */
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    relativePath: text("relative_path").notNull(),
    extension: text("extension").notNull(),
    sizeBytes: integer("size_bytes"),
    /** First run of digits in the filename. Orders per-track 台本 and is what
     *  links them to their track — see `lib/assets/link-scripts.ts`. */
    orderHint: integer("order_hint"),
  },
  (t) => [
    index("work_assets_work_idx").on(t.workId),
    uniqueIndex("work_assets_path_idx").on(t.workId, t.relativePath),
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

/**
 * Cached loudness envelope for a track, used by the waveform seek bar.
 *
 * `peaks` is one unsigned byte per bucket (sqrt-companded RMS, see
 * lib/waveform.ts). `version` lets a future change to the extraction
 * parameters invalidate rows without a migration.
 */
export const trackWaveforms = sqliteTable("track_waveforms", {
  trackId: integer("track_id")
    .primaryKey()
    .references(() => tracks.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  buckets: integer("buckets").notNull(),
  peaks: blob("peaks", { mode: "buffer" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
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
export type WorkAsset = typeof workAssets.$inferSelect;
export type NewWorkAsset = typeof workAssets.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type VoiceActor = typeof voiceActors.$inferSelect;
export type Circle = typeof circles.$inferSelect;
