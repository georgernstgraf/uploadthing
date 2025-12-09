/*
  Warnings:

  - A unique constraint covering the columns `[ip,seen]` on the table `ipfact` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "ipfact_ip_key";

-- CreateIndex
CREATE UNIQUE INDEX "ipfact_ip_seen_key" ON "ipfact"("ip", "seen");
