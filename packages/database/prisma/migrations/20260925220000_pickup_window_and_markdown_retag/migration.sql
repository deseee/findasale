-- Feature: unsold-item pickup-window notices + physical-markdown staff alert list (2026-09-25)
--
-- Patrick's policy (verbatim): "15 days should be fine for settlement after an item is
-- unsold for 90 days and marked return to consignor... as long as we send a couple emails
-- in that 15 day window to state they should contact [organizer] or set a pickup window
-- online if [organizer] has those enabled." Item.pickupWindowStartedAt / pickupReminder2SentAt
-- let consignorExpiryNoticeJob.ts (reconciled this same day to trigger off Consignor.
-- returnPeriodDays, RETURN-disposition only) send exactly two reminder emails per item
-- during the 15-day window without ever re-sending. See jobs/consignorExpiryNoticeJob.ts.
--
-- Patrick's other request: a staff-facing "needs physical re-tagging" list for items the
-- system auto-marked down (markdownCron.ts / markdownCycleCron.ts, which already set
-- Item.markdownApplied = true). Item.markdownPhysicallyAppliedAt tracks whether a staff
-- member has re-tagged the shelf yet -- deliberately NOT reusing markdownApplied itself,
-- which markdown-cron idempotency filters already depend on. Reset to NULL by both cron
-- files whenever a later markdown stage changes the price again.
--
-- SAFETY: additive only. No DROP, no ALTER of an existing column, no backfill, no data
-- movement -- every existing row reads NULL on all three new columns, which is exactly the
-- correct starting state ("not yet notified" / "needs physical re-tagging"). Notification
-- and staff-workflow only -- nothing here touches payouts, Stripe/Square/Finix, or any
-- money-movement logic.
--
-- Down migration (safe at any time pre-launch of this feature):
--   DROP INDEX "Item_organizerId_markdownApplied_markdownPhysicallyAppliedAt_idx";
--   DROP INDEX "Item_consignorId_status_pickupWindowStartedAt_idx";
--   ALTER TABLE "Item" DROP COLUMN "markdownPhysicallyAppliedAt";
--   ALTER TABLE "Item" DROP COLUMN "pickupWindowStartedAt";
--   ALTER TABLE "Item" DROP COLUMN "pickupReminder2SentAt";

ALTER TABLE "Item" ADD COLUMN "markdownPhysicallyAppliedAt" TIMESTAMP(3);

ALTER TABLE "Item" ADD COLUMN "pickupWindowStartedAt" TIMESTAMP(3);
ALTER TABLE "Item" ADD COLUMN "pickupReminder2SentAt" TIMESTAMP(3);

CREATE INDEX "Item_organizerId_markdownApplied_markdownPhysicallyAppliedAt_idx" ON "Item"("organizerId", "markdownApplied", "markdownPhysicallyAppliedAt");

CREATE INDEX "Item_consignorId_status_pickupWindowStartedAt_idx" ON "Item"("consignorId", "status", "pickupWindowStartedAt");
