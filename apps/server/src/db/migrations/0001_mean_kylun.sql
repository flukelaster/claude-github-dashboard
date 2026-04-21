ALTER TABLE `messages` ADD `message_uid` text;--> statement-breakpoint
CREATE INDEX `messages_message_uid` ON `messages` (`message_uid`);