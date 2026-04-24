ALTER TABLE `repos` RENAME COLUMN `github_owner` TO `remote_owner`;--> statement-breakpoint
ALTER TABLE `repos` RENAME COLUMN `github_name` TO `remote_name`;--> statement-breakpoint
ALTER TABLE `repos` ADD `provider` text DEFAULT 'github' NOT NULL;--> statement-breakpoint
ALTER TABLE `repos` ADD `sync_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX `repos_provider_idx` ON `repos` (`provider`);
