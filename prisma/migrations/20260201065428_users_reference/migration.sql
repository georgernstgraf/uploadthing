/*
  Warnings:

  - You are about to drop the column `at` on the `forensic_registrations` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_abgaben" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "ip" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "at" DATETIME NOT NULL,
    CONSTRAINT "abgaben_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_abgaben" ("at", "filename", "id", "ip", "userId") SELECT "at", "filename", "id", "ip", "userId" FROM "abgaben";
DROP TABLE "abgaben";
ALTER TABLE "new_abgaben" RENAME TO "abgaben";
CREATE INDEX "abgaben_userId_idx" ON "abgaben"("userId");
CREATE INDEX "abgaben_at_idx" ON "abgaben"("at");
CREATE TABLE "new_forensic_registrations" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ip" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    CONSTRAINT "forensic_registrations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_forensic_registrations" ("id", "ip", "userId") SELECT "id", "ip", "userId" FROM "forensic_registrations";
DROP TABLE "forensic_registrations";
ALTER TABLE "new_forensic_registrations" RENAME TO "forensic_registrations";
CREATE INDEX "forensic_registrations_userId_idx" ON "forensic_registrations"("userId");
CREATE INDEX "forensic_registrations_ip_idx" ON "forensic_registrations"("ip");
CREATE TABLE "new_registrations" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ip" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "at" DATETIME NOT NULL,
    CONSTRAINT "registrations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_registrations" ("at", "id", "ip", "userId") SELECT "at", "id", "ip", "userId" FROM "registrations";
DROP TABLE "registrations";
ALTER TABLE "new_registrations" RENAME TO "registrations";
CREATE INDEX "registrations_userId_idx" ON "registrations"("userId");
CREATE INDEX "registrations_ip_idx" ON "registrations"("ip");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
