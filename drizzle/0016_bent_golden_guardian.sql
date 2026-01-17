CREATE TABLE `visual_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`heroBackgroundUrl` text,
	`heroBackgroundKey` text,
	`heroBackgroundZoom` decimal(5,2) DEFAULT '1.00',
	`heroBackgroundOffsetX` decimal(10,2) DEFAULT '0.00',
	`heroBackgroundOffsetY` decimal(10,2) DEFAULT '0.00',
	`logoUrl` text,
	`logoKey` text,
	`logoZoom` decimal(5,2) DEFAULT '1.00',
	`logoOffsetX` decimal(10,2) DEFAULT '0.00',
	`logoOffsetY` decimal(10,2) DEFAULT '0.00',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`updatedBy` int,
	CONSTRAINT `visual_settings_id` PRIMARY KEY(`id`)
);
