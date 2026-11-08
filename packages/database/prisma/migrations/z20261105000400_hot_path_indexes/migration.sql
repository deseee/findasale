-- Hot-path indexes (2026-11-05, database schema review 2026-11-04 items #11, #12).
--
-- WHAT: lookups that currently scan: processor-account / subscription ids hit by webhooks and OAuth callbacks,
-- per-sale purchase reporting, refund history, follower fan-out, favorites by item/sale, newest-first inboxes,
-- message threads, import dedup and organizer item lists. Names and column order are exactly what schema.prisma's
-- new @@index lines generate (checked with `prisma migrate diff` against a database built from all migrations).
-- Purchase (saleId, status, createdAt) and Message (conversationId, createdAt) make the single-column
-- Purchase_saleId_idx / Message_conversationId_idx strict prefixes; those are dropped in z20261105000500.
--
-- LOCKING: plain CREATE INDEX, not CONCURRENTLY. Prisma runs a multi-statement migration as one implicit transaction,
-- where CONCURRENTLY is refused (25001); CONCURRENTLY would need one migration folder per index (as
-- 20260630120000_sentry_emailDiscoveredAt_index_s1046 does). Each build takes a SHARE lock (reads continue, writes
-- wait). The largest tables here are Organizer (~84k rows, mostly scraped) and Item (~tens of thousands); each
-- build is a second or two at most. Run outside the busiest hour if Notification has grown large:
--   SELECT relname, n_live_tup FROM pg_stat_user_tables WHERE relname IN ('Organizer','User','Item','Notification','Message','Purchase','Favorite','Follow');
--
-- ROLLBACK: DROP INDEX IF EXISTS each index below (no data changes).

CREATE INDEX IF NOT EXISTS "Organizer_squareMerchantId_idx" ON "Organizer"("squareMerchantId");
CREATE INDEX IF NOT EXISTS "Organizer_stripeConnectId_idx" ON "Organizer"("stripeConnectId");
CREATE INDEX IF NOT EXISTS "Organizer_stripeSubscriptionId_idx" ON "Organizer"("stripeSubscriptionId");

CREATE INDEX IF NOT EXISTS "User_stripeCustomerId_idx" ON "User"("stripeCustomerId");
CREATE INDEX IF NOT EXISTS "User_huntPassStripeSubscriptionId_idx" ON "User"("huntPassStripeSubscriptionId");

CREATE INDEX IF NOT EXISTS "Consignor_stripeAccountId_idx" ON "Consignor"("stripeAccountId");
CREATE INDEX IF NOT EXISTS "Consignor_squareAccountId_idx" ON "Consignor"("squareAccountId");

CREATE INDEX IF NOT EXISTS "VendorBooth_squareAccountId_idx" ON "VendorBooth"("squareAccountId");

CREATE INDEX IF NOT EXISTS "Purchase_saleId_status_createdAt_idx" ON "Purchase"("saleId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "Purchase_refundedAt_idx" ON "Purchase"("refundedAt");

CREATE INDEX IF NOT EXISTS "Follow_organizerId_idx" ON "Follow"("organizerId");
CREATE INDEX IF NOT EXISTS "SmartFollow_organizerId_idx" ON "SmartFollow"("organizerId");

CREATE INDEX IF NOT EXISTS "Favorite_itemId_idx" ON "Favorite"("itemId");
CREATE INDEX IF NOT EXISTS "Favorite_saleId_idx" ON "Favorite"("saleId");

CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

CREATE INDEX IF NOT EXISTS "Conversation_organizerId_lastMessageAt_idx" ON "Conversation"("organizerId", "lastMessageAt" DESC);

CREATE INDEX IF NOT EXISTS "Item_sourceItemId_idx" ON "Item"("sourceItemId");
CREATE INDEX IF NOT EXISTS "Item_organizerId_status_idx" ON "Item"("organizerId", "status");
