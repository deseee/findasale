-- Item.lastEditedAt (2026-10-04): the moment an ORGANIZER last changed something user-visible on an item.
--
-- WHY: "Item"."updatedAt" cannot answer "when did the organizer last edit this?" because roughly 189 writer
-- sites (markdown and renewal crons, marketplace sync jobs, automated enrichment, eBay pull-sync) bump it on every
-- write. This column is stamped ONLY by organizer-driven flows via packages/backend/src/utils/organizerEdit.ts.
--
-- SAFETY: additive and idempotent. Nullable, no default, no backfill, no index. NULL means "no organizer edit
-- recorded yet". Apply manually BEFORE deploying the matching backend build.

ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "lastEditedAt" TIMESTAMP(3);
