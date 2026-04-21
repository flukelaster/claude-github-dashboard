CREATE TABLE `commits` (
	`sha` text NOT NULL,
	`repo_id` integer NOT NULL,
	`author_name` text,
	`author_email` text,
	`authored_at` text NOT NULL,
	`committer_email` text,
	`committed_at` text NOT NULL,
	`message` text,
	`additions` integer DEFAULT 0 NOT NULL,
	`deletions` integer DEFAULT 0 NOT NULL,
	`files_changed_json` text,
	`co_authored_claude` integer DEFAULT false NOT NULL,
	`is_ai_assisted` integer DEFAULT false NOT NULL,
	`pr_number` integer,
	`branch` text,
	PRIMARY KEY(`repo_id`, `sha`)
);
--> statement-breakpoint
CREATE INDEX `commits_authored_at` ON `commits` (`authored_at`);--> statement-breakpoint
CREATE INDEX `commits_repo_authored` ON `commits` (`repo_id`,`authored_at`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`ts` text NOT NULL,
	`type` text,
	`model` text,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cache_read_tokens` integer DEFAULT 0 NOT NULL,
	`cache_write_tokens` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`files_touched_json` text
);
--> statement-breakpoint
CREATE INDEX `messages_session_id` ON `messages` (`session_id`);--> statement-breakpoint
CREATE INDEX `messages_ts` ON `messages` (`ts`);--> statement-breakpoint
CREATE TABLE `pull_requests` (
	`repo_id` integer NOT NULL,
	`number` integer NOT NULL,
	`title` text,
	`state` text,
	`author_login` text,
	`created_at` text,
	`merged_at` text,
	`closed_at` text,
	`additions` integer DEFAULT 0 NOT NULL,
	`deletions` integer DEFAULT 0 NOT NULL,
	`review_count` integer DEFAULT 0 NOT NULL,
	`time_to_merge_minutes` integer,
	`ai_assisted_commit_count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`repo_id`, `number`)
);
--> statement-breakpoint
CREATE TABLE `repos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`local_path` text NOT NULL,
	`github_owner` text,
	`github_name` text,
	`default_branch` text,
	`last_synced_at` text,
	`opted_out` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repos_local_path_unique` ON `repos` (`local_path`);--> statement-breakpoint
CREATE TABLE `session_commit_links` (
	`session_id` text NOT NULL,
	`repo_id` integer NOT NULL,
	`commit_sha` text NOT NULL,
	`score` integer NOT NULL,
	`confidence` text NOT NULL,
	`attribution_ratio` real DEFAULT 1 NOT NULL,
	`reason_json` text,
	PRIMARY KEY(`session_id`, `repo_id`, `commit_sha`)
);
--> statement-breakpoint
CREATE INDEX `scl_commit` ON `session_commit_links` (`repo_id`,`commit_sha`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_path` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text NOT NULL,
	`message_count` integer DEFAULT 0 NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cache_read_tokens` integer DEFAULT 0 NOT NULL,
	`cache_write_5m_tokens` integer DEFAULT 0 NOT NULL,
	`cache_write_1h_tokens` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`primary_model` text,
	`git_branch` text
);
--> statement-breakpoint
CREATE INDEX `sessions_started_at` ON `sessions` (`started_at`);--> statement-breakpoint
CREATE INDEX `sessions_project_path` ON `sessions` (`project_path`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`source` text NOT NULL,
	`key` text NOT NULL,
	`byte_offset` integer DEFAULT 0 NOT NULL,
	`etag` text,
	`last_synced_at` text,
	PRIMARY KEY(`source`, `key`)
);
