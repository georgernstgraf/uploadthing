/*
  Warnings:

  - A unique constraint covering the columns `[file]` on the table `knownlog` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "knownlog_file_key" ON "knownlog"("file");
