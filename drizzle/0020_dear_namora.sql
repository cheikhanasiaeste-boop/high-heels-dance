ALTER TABLE `purchases` ADD `isCompleted` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `purchases` ADD `completedAt` timestamp;