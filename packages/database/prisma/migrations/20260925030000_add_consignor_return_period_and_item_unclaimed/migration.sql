-- ADR consignment-unclaimed-items (2026-09-25)
-- Turns Consignor.unsoldItemDisposition (RETURN/DONATE/RELIST) from purely informational
-- into something a daily job can act on: it needed a per-consignor "how long before an
-- unsold item counts as unclaimed" window, and a per-item marker so that job never
-- re-notifies for the same item. See jobs/consignmentUnclaimedItemsJob.ts.
--
-- Consignor.returnPeriodDays: days after an item's intake (Item.createdAt -- no separate
-- intake-date field was added; createdAt already means "when this item was dropped off")
-- before it counts as unclaimed for that consignor. Defaults to 90 for every existing row;
-- organizer-overridable per consignor later (no override UI yet, just the column).
--
-- Item.unclaimedNotifiedAt: stamped once the "this item is unclaimed" organizer
-- notification has fired for it. Nullable, no default -- every existing row reads NULL
-- ("not yet notified"), which is exactly the correct starting state.
--
-- SAFETY: additive only. No DROP, no ALTER of an existing column, no backfill, no data
-- movement. Both columns are metadata-only changes on PostgreSQL. Notification-only
-- feature -- nothing here touches payouts, Stripe/Square/Finix, or unsoldItemDisposition's
-- existing behavior.
--
-- Down migration (safe at any time pre-launch of this feature):
--   ALTER TABLE "Consignor" DROP COLUMN "returnPeriodDays";
--   DROP INDEX "Item_consignorId_status_unclaimedNotifiedAt_idx";
--   ALTER TABLE "Item" DROP COLUMN "unclaimedNotifiedAt";

ALTER TABLE "Consignor" ADD COLUMN "returnPeriodDays" INTEGER NOT NULL DEFAULT 90;

ALTER TABLE "Item" ADD COLUMN "unclaimedNotifiedAt" TIMESTAMP(3);

CREATE INDEX "Item_consignorId_status_unclaimedNotifiedAt_idx" ON "Item"("consignorId", "status", "unclaimedNotifiedAt");
