ALTER TABLE `users` ADD `emailSessionEnrollment` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `emailSessionReminders` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `emailMessages` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `emailCourseCompletion` boolean DEFAULT true NOT NULL;