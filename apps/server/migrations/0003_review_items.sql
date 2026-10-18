CREATE TABLE `review_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`raw_title` text NOT NULL,
	`parsed` text NOT NULL,
	`candidates` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`decided_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `playback_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "review_items_status_known" CHECK(status in ('pending', 'resolved', 'dismissed'))
);
--> statement-breakpoint
CREATE INDEX `review_items_status` ON `review_items` (`status`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `review_items_session` ON `review_items` (`session_id`);