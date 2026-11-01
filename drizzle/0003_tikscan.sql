CREATE TABLE `tikscan` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` DATETIME NOT NULL
);
--> statement-breakpoint
-- Backfill (#163): Bis hierher war die Scan-Achse `DISTINCT ipfact.seen`.
-- Diese Zeilen sind faktengleich zu dem, was die Auswertung bisher gesehen
-- hat, und machen die Scan-Achse zur eigenen Zeitachse; ab jetzt schreibt
-- der Poller jeden Abruf — auch einen leeren — direkt nach `tikscan`.
INSERT OR IGNORE INTO "tikscan" ("at") SELECT DISTINCT "seen" FROM "ipfact";
--> statement-breakpoint
CREATE UNIQUE INDEX `tikscan_at_key` ON `tikscan` (`at`);
