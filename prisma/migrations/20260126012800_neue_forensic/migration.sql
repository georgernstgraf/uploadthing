-- CreateTable
CREATE TABLE "forensic_registrations" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ip" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "at" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "forensic_registrations_userId_idx" ON "forensic_registrations"("userId");

-- CreateIndex
CREATE INDEX "forensic_registrations_ip_idx" ON "forensic_registrations"("ip");
