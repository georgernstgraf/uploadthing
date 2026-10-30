-- Baseline #133: Ist-Zustand des Schemas (vorher Prisma-Migrationen 2026-01-25 bis 2026-10-12).
--
-- Diese Migration ist bewusst idempotent (`IF NOT EXISTS`): auf einer
-- bestehenden Installation wird sie nur als angewendet verbucht und nicht
-- ausgeführt; fehlt der Datenbank etwas (älterer Stand), gleicht sie die
-- Objekte an, ohne Daten zu verlieren. Neue Migrationen werden von
-- `drizzle-kit generate` erzeugt und bleiben unverändert.
CREATE TABLE IF NOT EXISTS `abgaben` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`ip` text NOT NULL,
	`filename` text NOT NULL,
	`at` DATETIME NOT NULL,
	CONSTRAINT `abgaben_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `abgaben_userId_idx` ON `abgaben` (`userId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `abgaben_at_idx` ON `abgaben` (`at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `abgaben_ip_at_idx` ON `abgaben` (`ip`,`at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `cookiepresents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ip` text NOT NULL,
	`at` DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`userId` integer NOT NULL,
	CONSTRAINT `cookiepresents_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cookiepresents_userId_idx` ON `cookiepresents` (`userId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `cookiepresents_ip_at_idx` ON `cookiepresents` (`ip`,`at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `examstate` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`status` text NOT NULL,
	`duration_seconds` integer NOT NULL,
	`started_at` DATETIME,
	`paused_seconds` integer NOT NULL,
	`extra_seconds` integer NOT NULL,
	`updated_at` DATETIME NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ipfact` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ip` text NOT NULL,
	`seen` DATETIME NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `ipfact_ip_seen_key` ON `ipfact` (`ip`,`seen`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ipfact_seen_ip_idx` ON `ipfact` (`seen`,`ip`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `registrations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ip` text NOT NULL,
	`at` DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`userId` integer NOT NULL,
	CONSTRAINT `registrations_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `registrations_userId_idx` ON `registrations` (`userId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `registrations_ip_at_idx` ON `registrations` (`ip`,`at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`klasse` text,
	`updatedat` DATETIME NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `users_email_key` ON `users` (`email`);--> statement-breakpoint
-- Redundante Einzelspalten-Indizes des Forensik-Umbaus (Prisma-Migration
-- 20260312155839) entfernen: die Hot-Queries laufen über die Composite-Indizes.
DROP INDEX IF EXISTS `cookiepresents_ip_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `ipfact_seen_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `ipfact_ip_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `registrations_ip_idx`;
