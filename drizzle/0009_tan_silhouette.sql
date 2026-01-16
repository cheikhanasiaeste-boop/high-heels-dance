CREATE TABLE `page_analytics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`session_id` varchar(255) NOT NULL,
	`visitor_id` varchar(255) NOT NULL,
	`page_path` varchar(500) NOT NULL,
	`referrer` text,
	`user_agent` text,
	`entry_time` timestamp NOT NULL DEFAULT (now()),
	`exit_time` timestamp,
	`duration` int,
	`is_bounce` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `page_analytics_id` PRIMARY KEY(`id`)
);
