CREATE TABLE `discountCodes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`description` text,
	`discountType` enum('percentage','fixed') NOT NULL,
	`discountValue` decimal(10,2) NOT NULL,
	`validFrom` timestamp NOT NULL,
	`validTo` timestamp NOT NULL,
	`maxUses` int,
	`currentUses` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`applicableTo` enum('all','subscriptions','courses') NOT NULL DEFAULT 'all',
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `discountCodes_id` PRIMARY KEY(`id`),
	CONSTRAINT `discountCodes_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `discountUsage` (
	`id` int AUTO_INCREMENT NOT NULL,
	`discountCodeId` int NOT NULL,
	`userId` int NOT NULL,
	`usedAt` timestamp NOT NULL DEFAULT (now()),
	`discountAmount` decimal(10,2) NOT NULL,
	`originalAmount` decimal(10,2) NOT NULL,
	`finalAmount` decimal(10,2) NOT NULL,
	`transactionType` enum('subscription','course') NOT NULL,
	`transactionId` varchar(255),
	CONSTRAINT `discountUsage_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `discountUsage` ADD CONSTRAINT `discountUsage_discountCodeId_discountCodes_id_fk` FOREIGN KEY (`discountCodeId`) REFERENCES `discountCodes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `discountUsage` ADD CONSTRAINT `discountUsage_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `discountCodes_code_idx` ON `discountCodes` (`code`);--> statement-breakpoint
CREATE INDEX `discountCodes_createdBy_idx` ON `discountCodes` (`createdBy`);--> statement-breakpoint
CREATE INDEX `discountUsage_discountCodeId_idx` ON `discountUsage` (`discountCodeId`);--> statement-breakpoint
CREATE INDEX `discountUsage_userId_idx` ON `discountUsage` (`userId`);