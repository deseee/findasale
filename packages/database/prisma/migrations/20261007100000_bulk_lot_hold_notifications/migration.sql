-- ADR-136 Addendum D (2026-10-06, roadmap #659): customer emails for bulk lot holds.
--   "BulkLotHold"."customerEmail"   TEXT, optional contact for an organizer hold (a shopper hold uses the shopper's account email)
--   "BulkLotHold"."reminderSentAt"  TIMESTAMP(3), set (compare and swap) just before the one expiry reminder is sent
--
-- Why: an organizer hold usually has only a customer name, so there was nobody to email. The confirmation, the one reminder
-- before the hold ends, and the "hold ended" notice need an address; the reminder also needs a way to say "already sent"
-- that two overlapping sweeps (or two servers) cannot both claim.
--
-- SAFETY: additive and idempotent. Two nullable columns, no default, no backfill, no index, no change to any existing column.
-- NULL on every existing row, which means "no email, no reminder": an existing hold behaves exactly as before. Nothing reads or
-- writes either column unless CARD_BULK_LOTS_ENABLED is true, so applying this is harmless with the flag off.
-- Migrations apply in name order. This one needs "BulkLotHold", created by 20261005160000_bulk_lot_followups, and is named to sort
-- after every dated migration that exists today (the latest is 20261007000000_pos_consignor_tag_lines; the one lettered folder,
-- z20261006000000_..., sorts last and does not touch this table).
-- Apply it BEFORE deploying the matching backend build: the regenerated Prisma client selects both columns on every default
-- read of "BulkLotHold" (the hold list, the sweep, the payment recorder), so a build without the columns fails those reads.
-- Do not apply to production from an agent session; Patrick applies it with prisma migrate deploy, then prisma generate.
--
-- ROLLBACK (safe at any time; the only loss is the saved customer emails and the "reminder already sent" marks, so a reminder
-- could be sent again if the columns are re-added while a hold is still open):
--   ALTER TABLE "BulkLotHold" DROP COLUMN IF EXISTS "reminderSentAt";
--   ALTER TABLE "BulkLotHold" DROP COLUMN IF EXISTS "customerEmail";

ALTER TABLE "BulkLotHold" ADD COLUMN IF NOT EXISTS "customerEmail" TEXT;
ALTER TABLE "BulkLotHold" ADD COLUMN IF NOT EXISTS "reminderSentAt" TIMESTAMP(3);
