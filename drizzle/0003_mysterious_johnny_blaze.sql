ALTER TABLE `availabilitySlots` ADD `eventType` enum('online','in-person') DEFAULT 'online' NOT NULL;--> statement-breakpoint
ALTER TABLE `availabilitySlots` ADD `location` text;--> statement-breakpoint
ALTER TABLE `availabilitySlots` ADD `isFree` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `availabilitySlots` ADD `price` varchar(20);--> statement-breakpoint
ALTER TABLE `availabilitySlots` ADD `title` varchar(200) DEFAULT 'One-on-One Dance Session' NOT NULL;--> statement-breakpoint
ALTER TABLE `availabilitySlots` ADD `description` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `paymentRequired` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `paymentStatus` enum('pending','completed','failed','not_required') DEFAULT 'not_required' NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `stripePaymentIntentId` varchar(255);--> statement-breakpoint
ALTER TABLE `bookings` ADD `amountPaid` varchar(20);