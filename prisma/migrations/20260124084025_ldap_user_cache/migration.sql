-- CreateTable
CREATE TABLE "ldapusercache" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "klasse" TEXT NOT NULL,
    "updatedat" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ldapusercache_email_key" ON "ldapusercache"("email");
