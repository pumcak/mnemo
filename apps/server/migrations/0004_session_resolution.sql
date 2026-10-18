ALTER TABLE `playback_sessions` ADD `resolution_state` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `playback_sessions` ADD `resolved_catalogue` text;--> statement-breakpoint
ALTER TABLE `playback_sessions` ADD `resolved_external_id` integer;--> statement-breakpoint
ALTER TABLE `playback_sessions` ADD `resolved_title` text;--> statement-breakpoint
ALTER TABLE `playback_sessions` ADD `resolution_score` real;--> statement-breakpoint
ALTER TABLE `playback_sessions` ADD `resolved_at` integer;