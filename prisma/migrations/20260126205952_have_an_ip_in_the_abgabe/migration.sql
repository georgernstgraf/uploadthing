/*
  Warnings:

  - Added the required column `ip` to the `abgaben` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_abgaben" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "ip" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "at" DATETIME NOT NULL
);
INSERT INTO "new_abgaben" ("at", "filename", "id", "userId") SELECT "at", "filename", "id", "userId" FROM "abgaben";
DROP TABLE "abgaben";
ALTER TABLE "new_abgaben" RENAME TO "abgaben";
CREATE INDEX "abgaben_userId_idx" ON "abgaben"("userId");
CREATE INDEX "abgaben_at_idx" ON "abgaben"("at");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
