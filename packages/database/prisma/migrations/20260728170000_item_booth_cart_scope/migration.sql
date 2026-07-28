-- P0 cart-scope fix (findasale-hacker fix-and-reverify pass, 2026-07-28).
--
-- vendorBoothCartController.resolveBoothLegItems() summed EVERY item a booth had
-- RESERVED hub-wide into whichever cart asked, because an Item had no link to the
-- specific BoothCartTransaction that reserved it. Two live carts holding the same
-- booth's items therefore each charged for both carts' goods (and inflated the
-- platform application_fee_amount and the hub owner's revenue-share slice with it),
-- and cancelBoothCart released the other cart's reservations back to AVAILABLE.
--
-- Purely additive: one nullable column + one index + one SET NULL FK. No existing
-- row changes meaning, no column is dropped or retyped, and nothing outside the
-- booth-cart flow reads or writes this column.
--
-- PRE-EXISTING RESERVED ROWS (backfill -- NOT run by this migration, deliberately):
-- any Item left RESERVED before this deploy has boothCartTransactionId = NULL, so
-- resolveBoothLegItems will not include it in any leg and cancelBoothCart will not
-- release it. Those rows are orphaned reservations, not chargeable inventory. They
-- must be triaged by hand rather than mass-assigned to a cart, because the old data
-- genuinely cannot say which cart reserved them. Recommended triage, in order:
--   1. SELECT i."id", i."vendorBoothId", i."updatedAt" FROM "Item" i
--      WHERE i."status" = 'RESERVED' AND i."boothCartTransactionId" IS NULL;
--   2. For each, look for a still-open cart on the same hub
--      (BoothCartTransaction.status IN ('PENDING','IN_PROGRESS','CAPTURING') whose
--      boothsRepresented contains that vendorBoothId). Expected count is ~0: booth
--      carts are minutes-long, and no cart survives a deploy.
--   3. Items with NO such open cart are stale reservations -- set them back to
--      'AVAILABLE' so vendors can sell them again. Do this as an explicit, reviewed
--      one-off UPDATE after Patrick eyeballs the list, never inside this migration.

ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "boothCartTransactionId" TEXT;

CREATE INDEX IF NOT EXISTS "Item_boothCartTransactionId_idx" ON "Item"("boothCartTransactionId");

ALTER TABLE "Item"
  ADD CONSTRAINT "Item_boothCartTransactionId_fkey"
  FOREIGN KEY ("boothCartTransactionId") REFERENCES "BoothCartTransaction"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
