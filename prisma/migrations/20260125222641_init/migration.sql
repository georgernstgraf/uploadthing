-- CreateTable
CREATE TABLE "ipfact" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ip" TEXT NOT NULL,
    "seen" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "klasse" TEXT,
    "updatedat" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "registrations" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ip" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "abgaben" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "at" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "ipfact_ip_idx" ON "ipfact"("ip");

-- CreateIndex
CREATE INDEX "ipfact_seen_idx" ON "ipfact"("seen");

-- CreateIndex
CREATE UNIQUE INDEX "ipfact_ip_seen_key" ON "ipfact"("ip", "seen");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "registrations_userId_idx" ON "registrations"("userId");

-- CreateIndex
CREATE INDEX "registrations_ip_idx" ON "registrations"("ip");

-- CreateIndex
CREATE INDEX "abgaben_userId_idx" ON "abgaben"("userId");

-- CreateIndex
CREATE INDEX "abgaben_at_idx" ON "abgaben"("at");
