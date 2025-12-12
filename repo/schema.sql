CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    TEXT PRIMARY KEY NOT NULL,
    "checksum"              TEXT NOT NULL,
    "finished_at"           DATETIME,
    "migration_name"        TEXT NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        DATETIME,
    "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS "ipfact" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ip" TEXT NOT NULL,
    "seen" DATETIME NOT NULL
);
CREATE TABLE sqlite_sequence(name,seq);
CREATE TABLE IF NOT EXISTS "knownlog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "file" TEXT NOT NULL
);
CREATE UNIQUE INDEX "ipfact_ip_seen_key" ON "ipfact"("ip", "seen");
CREATE UNIQUE INDEX "knownlog_file_key" ON "knownlog"("file");
CREATE INDEX "ipfact_ip_idx" ON "ipfact"("ip");
CREATE INDEX "ipfact_seen_idx" ON "ipfact"("seen");
CREATE TABLE IF NOT EXISTS "user" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ip" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "klasse" TEXT NOT NULL
);
CREATE UNIQUE INDEX "user_ip_key" ON "user"("ip");
CREATE TABLE IF NOT EXISTS "history" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ip" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "at" DATETIME NOT NULL
);
CREATE INDEX "history_email_idx" ON "history"("email");
CREATE INDEX "history_ip_idx" ON "history"("ip");
