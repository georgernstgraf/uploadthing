CREATE INDEX "cookiepresents_ip_at_idx" ON "cookiepresents"("ip", "at");

CREATE INDEX "registrations_ip_at_idx" ON "registrations"("ip", "at");

CREATE INDEX "abgaben_ip_at_idx" ON "abgaben"("ip", "at");

CREATE INDEX "ipfact_seen_ip_idx" ON "ipfact"("seen", "ip");
