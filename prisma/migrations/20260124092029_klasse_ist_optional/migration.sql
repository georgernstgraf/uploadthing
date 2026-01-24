-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ldapusercache" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "klasse" TEXT,
    "updatedat" DATETIME NOT NULL
);
INSERT INTO "new_ldapusercache" ("email", "id", "klasse", "name", "updatedat") SELECT "email", "id", "klasse", "name", "updatedat" FROM "ldapusercache";
DROP TABLE "ldapusercache";
ALTER TABLE "new_ldapusercache" RENAME TO "ldapusercache";
CREATE UNIQUE INDEX "ldapusercache_email_key" ON "ldapusercache"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
