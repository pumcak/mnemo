CREATE TABLE `views` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`watched_seconds` real NOT NULL,
	`progress` real,
	`validated_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `playback_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `views_validated` ON `views` (`validated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `views_session` ON `views` (`session_id`);