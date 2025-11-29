/*
  Warnings:

  - Added the required column `updated` to the `ip` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ip" TEXT NOT NULL,
    "name" TEXT,
    "updated" DATETIME NOT NULL
);
INSERT INTO "new_ip" ("id", "ip", "name") SELECT "id", "ip", "name" FROM "ip";
DROP TABLE "ip";
ALTER TABLE "new_ip" RENAME TO "ip";
CREATE UNIQUE INDEX "ip_ip_key" ON "ip"("ip");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
