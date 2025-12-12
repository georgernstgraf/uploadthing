-- CreateTable
CREATE TABLE "history" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ip" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "at" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "history_email_idx" ON "history"("email");

-- CreateIndex
CREATE INDEX "history_ip_idx" ON "history"("ip");
