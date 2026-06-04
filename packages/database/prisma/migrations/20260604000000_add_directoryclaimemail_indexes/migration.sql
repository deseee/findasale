-- Sentry NODEJS-2P: Slow DB query (1120ms) on DirectoryClaimEmail SELECT
-- Root cause 1: emailDiscoveryService.ts findFirst WHERE organizerId — FK column with no index → full table scan
CREATE INDEX "DirectoryClaimEmail_organizerId_idx" ON "DirectoryClaimEmail"("organizerId");

-- Root cause 2: outreachEmailsCron.ts cross-run dedup findFirst WHERE emailAddress — no index → full table scan per candidate
CREATE INDEX "DirectoryClaimEmail_emailAddress_idx" ON "DirectoryClaimEmail"("emailAddress");
