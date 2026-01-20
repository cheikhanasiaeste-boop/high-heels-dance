ALTER TABLE `availabilitySlots` ADD `meetLink` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `meetLink` text;--> statement-breakpoint
ALTER TABLE `availabilitySlots` DROP COLUMN `zoomMeetingId`;--> statement-breakpoint
ALTER TABLE `availabilitySlots` DROP COLUMN `zoomMeetingPassword`;--> statement-breakpoint
ALTER TABLE `availabilitySlots` DROP COLUMN `zoomJoinUrl`;--> statement-breakpoint
ALTER TABLE `availabilitySlots` DROP COLUMN `zoomStartUrl`;--> statement-breakpoint
ALTER TABLE `availabilitySlots` DROP COLUMN `zoomCreatedAt`;--> statement-breakpoint
ALTER TABLE `bookings` DROP COLUMN `zoomLink`;