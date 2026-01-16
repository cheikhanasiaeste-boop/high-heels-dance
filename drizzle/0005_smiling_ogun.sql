CREATE TABLE `testimonials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`userName` varchar(255) NOT NULL,
	`userEmail` varchar(320),
	`rating` int NOT NULL,
	`review` text NOT NULL,
	`photoUrl` text,
	`type` enum('session','course') NOT NULL,
	`relatedId` int,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`isFeatured` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `testimonials_id` PRIMARY KEY(`id`)
);
