CREATE TABLE `circles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`name_en` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `circles_name_unique` ON `circles` (`name`);--> statement-breakpoint
CREATE TABLE `likes` (
	`track_id` integer PRIMARY KEY NOT NULL,
	`liked_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`name_en` text,
	`category` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE INDEX `tags_name_idx` ON `tags` (`name`);--> statement-breakpoint
CREATE TABLE `track_progress` (
	`track_id` integer PRIMARY KEY NOT NULL,
	`position_seconds` real NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tracks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`work_id` text NOT NULL,
	`title` text NOT NULL,
	`relative_path` text NOT NULL,
	`extension` text NOT NULL,
	`size_bytes` integer,
	`duration_seconds` real,
	`track_number` integer,
	`disc_number` integer,
	FOREIGN KEY (`work_id`) REFERENCES `works`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tracks_work_idx` ON `tracks` (`work_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tracks_path_idx` ON `tracks` (`work_id`,`relative_path`);--> statement-breakpoint
CREATE TABLE `voice_actors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`name_en` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `voice_actors_name_unique` ON `voice_actors` (`name`);--> statement-breakpoint
CREATE INDEX `voice_actors_name_idx` ON `voice_actors` (`name`);--> statement-breakpoint
CREATE TABLE `work_tags` (
	`work_id` text NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`work_id`, `tag_id`),
	FOREIGN KEY (`work_id`) REFERENCES `works`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `wt_tag_idx` ON `work_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `work_voice_actors` (
	`work_id` text NOT NULL,
	`voice_actor_id` integer NOT NULL,
	PRIMARY KEY(`work_id`, `voice_actor_id`),
	FOREIGN KEY (`work_id`) REFERENCES `works`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`voice_actor_id`) REFERENCES `voice_actors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `wva_va_idx` ON `work_voice_actors` (`voice_actor_id`);--> statement-breakpoint
CREATE TABLE `works` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`title_kana` text,
	`circle_id` integer,
	`release_date` text,
	`age_rating` text,
	`language` text,
	`work_type` text,
	`description` text,
	`cover_url` text,
	`cover_path` text,
	`dlsite_url` text,
	`nsfw` integer DEFAULT false NOT NULL,
	`folder_path` text NOT NULL,
	`metadata_source` text,
	`last_scanned_at` integer,
	`last_metadata_sync_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`circle_id`) REFERENCES `circles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `works_circle_idx` ON `works` (`circle_id`);--> statement-breakpoint
CREATE INDEX `works_title_idx` ON `works` (`title`);--> statement-breakpoint
CREATE UNIQUE INDEX `works_folder_idx` ON `works` (`folder_path`);