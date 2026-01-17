CREATE TABLE `course_lessons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`moduleId` int NOT NULL,
	`courseId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`videoUrl` text,
	`videoKey` text,
	`duration` int,
	`content` text,
	`order` int NOT NULL DEFAULT 0,
	`isPublished` boolean NOT NULL DEFAULT true,
	`isFree` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `course_lessons_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `course_modules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`courseId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`order` int NOT NULL DEFAULT 0,
	`isPublished` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `course_modules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_lesson_progress` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`lessonId` int NOT NULL,
	`courseId` int NOT NULL,
	`isCompleted` boolean NOT NULL DEFAULT false,
	`lastWatchedAt` timestamp,
	`watchedDuration` int DEFAULT 0,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_lesson_progress_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_lesson_progress_userId_lessonId_unique` UNIQUE(`userId`,`lessonId`)
);
--> statement-breakpoint
CREATE INDEX `lesson_moduleId_idx` ON `course_lessons` (`moduleId`);--> statement-breakpoint
CREATE INDEX `lesson_courseId_idx` ON `course_lessons` (`courseId`);--> statement-breakpoint
CREATE INDEX `lesson_order_idx` ON `course_lessons` (`moduleId`,`order`);--> statement-breakpoint
CREATE INDEX `module_courseId_idx` ON `course_modules` (`courseId`);--> statement-breakpoint
CREATE INDEX `module_order_idx` ON `course_modules` (`courseId`,`order`);--> statement-breakpoint
CREATE INDEX `progress_userId_idx` ON `user_lesson_progress` (`userId`);--> statement-breakpoint
CREATE INDEX `progress_lessonId_idx` ON `user_lesson_progress` (`lessonId`);--> statement-breakpoint
CREATE INDEX `progress_courseId_idx` ON `user_lesson_progress` (`userId`,`courseId`);