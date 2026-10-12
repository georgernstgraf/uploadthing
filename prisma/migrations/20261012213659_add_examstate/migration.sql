-- CreateTable
CREATE TABLE "examstate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "status" TEXT NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "started_at" DATETIME,
    "paused_seconds" INTEGER NOT NULL,
    "extra_seconds" INTEGER NOT NULL,
    "updated_at" DATETIME NOT NULL
);
