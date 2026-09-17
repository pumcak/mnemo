CREATE TABLE `heartbeats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`observed_at` integer NOT NULL,
	`state` text NOT NULL,
	`position_seconds` real NOT NULL,
	`duration_seconds` real,
	FOREIGN KEY (`session_id`) REFERENCES `playback_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "heartbeats_state_known" CHECK(state in ('playing', 'paused', 'ended'))
);
--> statement-breakpoint
CREATE INDEX `heartbeats_session_observed` ON `heartbeats` (`session_id`,`observed_at`);--> statement-breakpoint
CREATE INDEX `heartbeats_observed` ON `heartbeats` (`observed_at`);--> statement-breakpoint
CREATE TABLE `playback_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_id` text NOT NULL,
	`source_id` integer NOT NULL,
	`raw_title` text NOT NULL,
	`url` text,
	`hint` text,
	`started_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`last_position_seconds` real NOT NULL,
	`duration_seconds` real,
	`watched_seconds` real DEFAULT 0 NOT NULL,
	`closed_at` integer,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `playback_sessions_device_last_seen` ON `playback_sessions` (`device_id`,`last_seen_at`);--> statement-breakpoint
CREATE INDEX `playback_sessions_open` ON `playback_sessions` (`closed_at`);