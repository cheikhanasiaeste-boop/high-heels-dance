ALTER TABLE `users` ADD `membershipStatus` enum('free','monthly','annual') DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `membershipStartDate` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `membershipEndDate` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `stripeSubscriptionId` varchar(255);