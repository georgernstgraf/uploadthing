-- RedefineIndex
DROP INDEX "history_ip_idx";
CREATE INDEX "registrations_ip_idx" ON "registrations"("ip");

-- RedefineIndex
DROP INDEX "history_email_idx";
CREATE INDEX "registrations_email_idx" ON "registrations"("email");
