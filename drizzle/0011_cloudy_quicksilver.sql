CREATE TABLE `user_course_enrollments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`courseId` int NOT NULL,
	`enrolledAt` timestamp NOT NULL DEFAULT (now()),
	`enrolledBy` int,
	`status` enum('active','completed','cancelled') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_course_enrollments_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_course_enrollments_userId_courseId_unique` UNIQUE(`userId`,`courseId`)
);
--> statement-breakpoint
CREATE INDEX `userId_idx` ON `user_course_enrollments` (`userId`);--> statement-breakpoint
CREATE INDEX `courseId_idx` ON `user_course_enrollments` (`courseId`);