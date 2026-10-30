CREATE TABLE `adminmac` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mac` text NOT NULL,
	`comment` text NOT NULL,
	`created_at` DATETIME NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `adminmac_mac_key` ON `adminmac` (`mac`);