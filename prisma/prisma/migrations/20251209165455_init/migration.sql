-- CreateTable
CREATE TABLE "ipfact" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ip" TEXT NOT NULL,
    "seen" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ipfact_ip_key" ON "ipfact"("ip");
