CREATE TABLE `popup_interactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`popupId` int NOT NULL,
	`email` varchar(320),
	`action` enum('dismissed','email_submitted') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `popup_interactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `popup_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`type` enum('email_collection','announcement','custom') NOT NULL DEFAULT 'announcement',
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`buttonText` varchar(100) NOT NULL DEFAULT 'Got it',
	`showEmailInput` boolean NOT NULL DEFAULT false,
	`emailPlaceholder` varchar(255) DEFAULT 'Enter your email',
	`backgroundColor` varchar(50) DEFAULT '#ffffff',
	`textColor` varchar(50) DEFAULT '#000000',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `popup_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `section_headings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`section` varchar(100) NOT NULL,
	`heading` varchar(255) NOT NULL,
	`subheading` text,
	`displayOrder` int NOT NULL DEFAULT 0,
	`isVisible` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `section_headings_id` PRIMARY KEY(`id`),
	CONSTRAINT `section_headings_section_unique` UNIQUE(`section`)
);
