ALTER TABLE `availabilitySlots` ADD `zoomMeetingId` varchar(50);--> statement-breakpoint
ALTER TABLE `availabilitySlots` ADD `zoomMeetingPassword` varchar(50);--> statement-breakpoint
ALTER TABLE `availabilitySlots` ADD `zoomJoinUrl` text;--> statement-breakpoint
ALTER TABLE `availabilitySlots` ADD `zoomStartUrl` text;--> statement-breakpoint
ALTER TABLE `availabilitySlots` ADD `zoomCreatedAt` timestamp;