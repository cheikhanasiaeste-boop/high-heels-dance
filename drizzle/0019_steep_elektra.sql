ALTER TABLE `availabilitySlots` ADD `sessionLink` text;--> statement-breakpoint
ALTER TABLE `availabilitySlots` ADD `status` enum('draft','published') DEFAULT 'published' NOT NULL;