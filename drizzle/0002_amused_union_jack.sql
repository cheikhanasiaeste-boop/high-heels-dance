CREATE TABLE `availabilitySlots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`startTime` timestamp NOT NULL,
	`endTime` timestamp NOT NULL,
	`isBooked` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `availabilitySlots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`slotId` int NOT NULL,
	`sessionType` varchar(100) NOT NULL,
	`zoomLink` text,
	`status` enum('pending','confirmed','cancelled') NOT NULL DEFAULT 'confirmed',
	`notes` text,
	`bookedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bookings_id` PRIMARY KEY(`id`)
);
