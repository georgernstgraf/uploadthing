/*
  Warnings:

  - Added the required column `klasse` to the `user` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_user" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ip" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "klasse" TEXT NOT NULL
);
INSERT INTO "new_user" ("email", "id", "ip", "name") SELECT "email", "id", "ip", "name" FROM "user";
DROP TABLE "user";
ALTER TABLE "new_user" RENAME TO "user";
CREATE UNIQUE INDEX "user_ip_key" ON "user"("ip");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
