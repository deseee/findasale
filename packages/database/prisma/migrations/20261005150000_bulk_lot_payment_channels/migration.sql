-- ADR-136 Addendum A (2026-10-05, roadmap #659): bulk lots on card, Square phone request and QR payment link.
--   "POSPaymentRequest"."bulkLines"  JSONB, the lot lines [{ itemId, cards, cents }] the server priced when the request was created
--   "POSPaymentLink"."bulkLines"     JSONB, the same for a QR / payment link
--
-- Why: a card request and a QR link are paid later, on the shopper's own device. The cards are taken and the Purchase rows
-- are written when the payment is confirmed (in one transaction), so the confirm step needs to know how many cards each
-- lot line was priced for. The request carries item ids only; these columns carry the quantities and the priced cents.
--
-- SAFETY: additive and idempotent. Two nullable columns, no default, no backfill, no index, no change to any existing
-- column. NULL on every existing row and on every request or link that holds no lot. Nothing writes either column
-- unless CARD_BULK_LOTS_ENABLED is true AND the cart holds a lot, so applying this is harmless with the flag off.
-- Migrations apply in name order: this one runs after 20261005130000_card_bulk_lots and before 20261005160000_bulk_lot_followups.
-- Apply all of them BEFORE deploying the matching backend build: the regenerated Prisma client selects both columns on
-- every default read of those two tables.
-- Do not apply to production from an agent session; Patrick applies it with prisma migrate deploy, then prisma generate.
--
-- ROLLBACK (only while no request or link that holds a lot is still open, otherwise the card counts of a payment that is
-- still in flight are lost):
--   ALTER TABLE "POSPaymentLink" DROP COLUMN IF EXISTS "bulkLines";
--   ALTER TABLE "POSPaymentRequest" DROP COLUMN IF EXISTS "bulkLines";

ALTER TABLE "POSPaymentRequest" ADD COLUMN IF NOT EXISTS "bulkLines" JSONB;
ALTER TABLE "POSPaymentLink" ADD COLUMN IF NOT EXISTS "bulkLines" JSONB;
