CREATE TABLE `episodes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_id` integer NOT NULL,
	`number` integer NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `episodes_season_number` ON `episodes` (`season_id`,`number`);--> statement-breakpoint
CREATE TABLE `seasons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`work_id` integer NOT NULL,
	`number` integer NOT NULL,
	FOREIGN KEY (`work_id`) REFERENCES `works`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seasons_work_number` ON `seasons` (`work_id`,`number`);--> statement-breakpoint
CREATE TABLE `works` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`catalogue` text NOT NULL,
	`external_id` integer NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`year` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "works_kind_known" CHECK(kind in ('movie', 'series')),
	CONSTRAINT "works_catalogue_known" CHECK(catalogue in ('tmdb', 'anilist'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `works_catalogue_external` ON `works` (`catalogue`,`external_id`);--> statement-breakpoint
ALTER TABLE `playback_sessions` ADD `work_id` integer REFERENCES works(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `playback_sessions` ADD `episode_id` integer REFERENCES episodes(id) ON DELETE set null;