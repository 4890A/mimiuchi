CREATE TABLE `track_waveforms` (
	`track_id` integer PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`buckets` integer NOT NULL,
	`peaks` blob NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
