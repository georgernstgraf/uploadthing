/*
  Warnings:

  - You are about to drop the `forensic_registrations` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropIndex
DROP INDEX "forensic_registrations_ip_idx";

-- DropIndex
DROP INDEX "forensic_registrations_userId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "forensic_registrations";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "cookiepresents" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ip" TEXT NOT NULL,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,
    CONSTRAINT "cookiepresents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_registrations" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ip" TEXT NOT NULL,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,
    CONSTRAINT "registrations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_registrations" ("at", "id", "ip", "userId") SELECT "at", "id", "ip", "userId" FROM "registrations";
DROP TABLE "registrations";
ALTER TABLE "new_registrations" RENAME TO "registrations";
CREATE INDEX "registrations_userId_idx" ON "registrations"("userId");
CREATE INDEX "registrations_ip_idx" ON "registrations"("ip");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "cookiepresents_ip_idx" ON "cookiepresents"("ip");

-- CreateIndex
CREATE INDEX "cookiepresents_userId_idx" ON "cookiepresents"("userId");
