CREATE TABLE `aliases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`normalized_title` text NOT NULL,
	`kind` text NOT NULL,
	`catalogue` text NOT NULL,
	`external_id` integer NOT NULL,
	`title` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "aliases_kind_known" CHECK(kind in ('movie', 'series')),
	CONSTRAINT "aliases_catalogue_known" CHECK(catalogue in ('tmdb', 'anilist'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `aliases_title_kind` ON `aliases` (`normalized_title`,`kind`);