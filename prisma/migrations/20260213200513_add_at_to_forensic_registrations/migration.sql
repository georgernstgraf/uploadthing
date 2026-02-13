-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_forensic_registrations" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ip" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "forensic_registrations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_forensic_registrations" ("id", "ip", "userId") SELECT "id", "ip", "userId" FROM "forensic_registrations";
DROP TABLE "forensic_registrations";
ALTER TABLE "new_forensic_registrations" RENAME TO "forensic_registrations";
CREATE INDEX "forensic_registrations_userId_idx" ON "forensic_registrations"("userId");
CREATE INDEX "forensic_registrations_ip_idx" ON "forensic_registrations"("ip");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
