-- Guest / no-account HoldInvoice recipient (2026-09-16)
-- Feature: organizer-initiated one-off email invoice (PRO/TEAMS), no pre-existing hold
-- and no pre-existing FindA.Sale account required on the recipient's side.
-- See guestInvoiceController.ts and holdInvoicePaymentRecorder.ts.
--
-- Additive + one nullability relaxation, no data loss, no backfill needed:
--   - shopperUserId becomes optional. Every existing row already has a real value here
--     (every prior HoldInvoice-creation path required a pre-existing ItemReservation,
--     which requires a real shopper account) -- dropping NOT NULL does not touch any
--     existing row's data.
--   - guestEmail / guestName are new, both null on every existing row. Mirrors the
--     already-shipped Purchase.userId (nullable) + Purchase.buyerEmail/guestName pattern
--     used today for POS walk-ins and online guest checkout -- same shape, same intent,
--     applied to HoldInvoice.
--
-- The FK constraint on shopperUserId (HoldInvoice_shopperUserId_fkey, ON DELETE CASCADE)
-- is untouched -- a nullable FK column simply has no referential action to enforce when
-- the value is null, no constraint change needed.
ALTER TABLE "HoldInvoice" ALTER COLUMN "shopperUserId" DROP NOT NULL;
ALTER TABLE "HoldInvoice" ADD COLUMN IF NOT EXISTS "guestEmail" TEXT;
ALTER TABLE "HoldInvoice" ADD COLUMN IF NOT EXISTS "guestName" TEXT;

-- Recipient contact + shipping (2026-09-16, same dispatch, folded into this migration
-- rather than a second one). All nullable, all new, no backfill. Field names deliberately
-- match Purchase's existing "SHIPPING DESTINATION" block (see Purchase model in
-- schema.prisma) exactly, so markHoldInvoicePaid can pass them straight through onto the
-- Purchase row(s) it creates on payment -- confirmed via a full-codebase check that
-- Purchase is the ONLY existing shape for an address anywhere in this app (always
-- captured fresh per-purchase at checkout; there is no persisted default/profile address
-- on User to instead read from). recipientPhone has no Purchase-side equivalent -- see
-- schema.prisma's own comment on this column for why.
ALTER TABLE "HoldInvoice" ADD COLUMN IF NOT EXISTS "recipientPhone" TEXT;
ALTER TABLE "HoldInvoice" ADD COLUMN IF NOT EXISTS "shippingAddressLine1" TEXT;
ALTER TABLE "HoldInvoice" ADD COLUMN IF NOT EXISTS "shippingAddressLine2" TEXT;
ALTER TABLE "HoldInvoice" ADD COLUMN IF NOT EXISTS "shippingCity" TEXT;
ALTER TABLE "HoldInvoice" ADD COLUMN IF NOT EXISTS "shippingState" TEXT;
ALTER TABLE "HoldInvoice" ADD COLUMN IF NOT EXISTS "shippingZip" TEXT;
ALTER TABLE "HoldInvoice" ADD COLUMN IF NOT EXISTS "shippingCountry" TEXT DEFAULT 'US';
