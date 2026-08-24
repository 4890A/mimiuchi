CREATE TABLE `work_assets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`work_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`relative_path` text NOT NULL,
	`extension` text NOT NULL,
	`size_bytes` integer,
	`order_hint` integer,
	FOREIGN KEY (`work_id`) REFERENCES `works`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `work_assets_work_idx` ON `work_assets` (`work_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `work_assets_path_idx` ON `work_assets` (`work_id`,`relative_path`);--> statement-breakpoint
ALTER TABLE `works` ADD `assets_scanned_at` integer;