ALTER TABLE `availabilitySlots` ADD `sessionType` enum('private','group') DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE `availabilitySlots` ADD `capacity` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `availabilitySlots` ADD `currentBookings` int DEFAULT 0 NOT NULL;