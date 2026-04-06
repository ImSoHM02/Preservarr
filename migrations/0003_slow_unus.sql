CREATE TABLE `titledb_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`version_source_id` integer NOT NULL,
	`title_id` text NOT NULL,
	`name` text,
	`version` text,
	`update_title_id` text,
	`dlc_title_ids` text,
	`icon_url` text,
	`publisher` text,
	`region` text,
	FOREIGN KEY (`version_source_id`) REFERENCES `version_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `titledb_entries_version_source_id_idx` ON `titledb_entries` (`version_source_id`);--> statement-breakpoint
CREATE INDEX `titledb_entries_title_id_idx` ON `titledb_entries` (`title_id`);
