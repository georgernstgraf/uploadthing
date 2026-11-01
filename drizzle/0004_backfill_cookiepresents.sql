-- Backfill (#163): Bis hierher schrieb nur der Request-Pfad cookiepresents;
-- eine Registrierung erzeugte nur eine `registrations`-Zeile. Ab jetzt ist
-- „ich bin X" von einer IP auch eine Präsenzaussage. Der Backfill zieht den
-- Altbestand faktengleich nach, damit Karte und Gruppe rückwirkend stimmen.
INSERT INTO "cookiepresents" ("ip", "userId", "at")
SELECT r."ip", r."userId", r."at" FROM "registrations" r
WHERE NOT EXISTS (
    SELECT 1 FROM "cookiepresents" c
    WHERE c."ip" = r."ip" AND c."userId" = r."userId" AND c."at" = r."at"
);
