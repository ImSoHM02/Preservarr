CREATE TABLE `dat_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`version_source_id` integer NOT NULL,
	`game_title` text NOT NULL,
	`region` text,
	`revision` text,
	`crc32` text,
	`md5` text,
	`sha1` text,
	FOREIGN KEY (`version_source_id`) REFERENCES `version_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dat_entries_version_source_id_idx` ON `dat_entries` (`version_source_id`);--> statement-breakpoint
CREATE INDEX `dat_entries_crc32_idx` ON `dat_entries` (`crc32`);--> statement-breakpoint
CREATE INDEX `dat_entries_sha1_idx` ON `dat_entries` (`sha1`);--> statement-breakpoint
CREATE TABLE `download_clients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`url` text NOT NULL,
	`username` text,
	`password` text,
	`download_path` text,
	`platform_paths` text,
	`enabled` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `download_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` integer NOT NULL,
	`indexer_id` integer,
	`release_title` text,
	`size_bytes` integer,
	`seeders` integer,
	`score` integer,
	`started_at` text DEFAULT (datetime('now')) NOT NULL,
	`completed_at` text,
	`status` text DEFAULT 'downloading' NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`indexer_id`) REFERENCES `indexers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `download_history_game_id_idx` ON `download_history` (`game_id`);--> statement-breakpoint
CREATE TABLE `game_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` integer NOT NULL,
	`path` text NOT NULL,
	`filename` text NOT NULL,
	`size_bytes` integer,
	`file_format` text,
	`crc32` text,
	`md5` text,
	`sha1` text,
	`known_version` text,
	`latest_version` text,
	`version_status` text DEFAULT 'unknown' NOT NULL,
	`version_checked_at` text,
	`imported_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `game_files_game_id_idx` ON `game_files` (`game_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `game_files_path_idx` ON `game_files` (`path`);--> statement-breakpoint
CREATE INDEX `game_files_crc32_idx` ON `game_files` (`crc32`);--> statement-breakpoint
CREATE INDEX `game_files_sha1_idx` ON `game_files` (`sha1`);--> statement-breakpoint
CREATE TABLE `games` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`igdb_id` integer,
	`screenscraper_id` integer,
	`platform_id` integer NOT NULL,
	`cover_url` text,
	`description` text,
	`region` text,
	`release_date` text,
	`genres` text,
	`alternate_names` text,
	`title_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`platform_id`) REFERENCES `platforms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `games_igdb_id_idx` ON `games` (`igdb_id`);--> statement-breakpoint
CREATE INDEX `games_platform_id_idx` ON `games` (`platform_id`);--> statement-breakpoint
CREATE INDEX `games_title_id_idx` ON `games` (`title_id`);--> statement-breakpoint
CREATE TABLE `indexers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`url` text NOT NULL,
	`api_key` text NOT NULL,
	`priority` integer DEFAULT 50 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`categories` text
);
--> statement-breakpoint
CREATE TABLE `notification_targets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`url` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`notify_on` text DEFAULT '["update_available","import","fail"]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `platforms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`file_extensions` text NOT NULL,
	`naming_standard` text DEFAULT 'none' NOT NULL,
	`version_source` text DEFAULT 'none' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`torznab_categories` text DEFAULT '6000' NOT NULL,
	`igdb_platform_id` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `platforms_slug_unique` ON `platforms` (`slug`);--> statement-breakpoint
CREATE TABLE `quality_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`platform_id` integer NOT NULL,
	`preferred_formats` text NOT NULL,
	`preferred_regions` text NOT NULL,
	`min_seeders` integer DEFAULT 1 NOT NULL,
	`upgrade_existing` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`platform_id`) REFERENCES `platforms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `search_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` integer NOT NULL,
	`query_used` text NOT NULL,
	`indexer_id` integer,
	`results_count` integer DEFAULT 0 NOT NULL,
	`best_score` integer,
	`searched_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`indexer_id`) REFERENCES `indexers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `search_history_game_id_idx` ON `search_history` (`game_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE TABLE `version_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`platform_id` integer NOT NULL,
	`source_type` text NOT NULL,
	`file_path` text,
	`url` text,
	`last_synced_at` text,
	`entry_count` integer DEFAULT 0,
	FOREIGN KEY (`platform_id`) REFERENCES `platforms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `version_sources_platform_id_idx` ON `version_sources` (`platform_id`);--> statement-breakpoint
CREATE TABLE `wanted_games` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` integer NOT NULL,
	`status` text DEFAULT 'wanted' NOT NULL,
	`monitored` integer DEFAULT true NOT NULL,
	`quality_profile_id` integer,
	`added_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`quality_profile_id`) REFERENCES `quality_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wanted_games_game_id_unique` ON `wanted_games` (`game_id`);--> statement-breakpoint
CREATE INDEX `wanted_games_status_idx` ON `wanted_games` (`status`);--> statement-breakpoint
CREATE INDEX `wanted_games_game_id_idx` ON `wanted_games` (`game_id`);