-- Sentry P1 FINDASALE-NODEJS-1Q: Add index on Review.saleId
-- The JOIN (Review → Sale via saleId) was doing a full table scan causing 17,391ms queries
CREATE INDEX "Review_saleId_idx" ON "Review"("saleId");

-- Sentry: Slow ItemReservation SELECT queries
-- Add index on userId for user-based hold lookups
CREATE INDEX "ItemReservation_userId_idx" ON "ItemReservation"("userId");
-- Add composite index on (status, expiresAt) for hold expiry cron and status filtering
CREATE INDEX "ItemReservation_status_expiresAt_idx" ON "ItemReservation"("status", "expiresAt");
