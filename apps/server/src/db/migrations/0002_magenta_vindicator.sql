CREATE TABLE `repo_languages` (
	`repo_id` integer NOT NULL,
	`language` text NOT NULL,
	`bytes` integer DEFAULT 0 NOT NULL,
	`color` text,
	PRIMARY KEY(`repo_id`, `language`)
);
--> statement-breakpoint
CREATE INDEX `repo_languages_repo` ON `repo_languages` (`repo_id`);