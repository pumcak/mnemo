CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`platform` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	CONSTRAINT "devices_platform_known" CHECK(platform in ('windows', 'linux', 'macos'))
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`app` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "sources_kind_known" CHECK(kind in ('browser', 'smtc', 'vlc', 'mpv', 'plex', 'jellyfin'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sources_kind_app` ON `sources` (`kind`,`app`);