-- Configurable Consignment Intake Floor + Relist Cap (2026-09-25, Patrick)
--
-- Earlier today's session hard-coded a $40 (4000 cents) minimum-price floor for
-- consigned items at intake (itemController.ts createItem/updateItem). Patrick asked for
-- that floor to be settable by the consignment organizer instead of hardcoded.
-- WorkspaceSettings.consignmentMinimumPriceCents is that override: null = platform
-- default of 4000 cents ($40), same "null means platform default" convention this table
-- already uses for intakeLinkToken. Settable via GET/PATCH
-- /api/workspace/:workspaceId/settings (workspaceController.ts), the same general
-- settings surface staffDiscountCapType/Value already use.
--
-- Relist Cap: real consignment-shop practice (researched this session, not guessed) is a
-- 60-120 day total consignment period with escalating markdowns and, critically, NO
-- silent auto-renewal -- either a notify-then-short-pickup-window, an opt-in extension, or
-- a hard ceiling. FindA.Sale's own policy (built earlier today) already has a 90-day
-- unsold period (Consignor.returnPeriodDays) with a 15-day RETURN-disposition pickup
-- window. Patrick wants RELIST-disposition items capped the same way: WorkspaceSettings.
-- maxRelistDays (nullable, DB-default 90 -- one additional full cycle past
-- returnPeriodDays, matching the researched norm rather than an arbitrary number). When a
-- RELIST item has been unsold for returnPeriodDays + maxRelistDays total,
-- consignmentUnclaimedItemsJob.ts's new processRelistCapExceededItems sweep flags it
-- (Item.relistCapFlaggedAt) for a staff decision on /organizer/consignors
-- (relistCapExceededCount badge) -- visibility/flagging only, same "notification-only,
-- never auto-donate/return/relist" posture as every other consignor-lifecycle column in
-- this table. Never touches a payout or settlement path.
--
-- SAFETY: additive only. No DROP, no ALTER of an existing column, no backfill of Item
-- rows, no data movement. maxRelistDays uses DEFAULT 90 (Postgres 11+ applies a constant
-- DEFAULT to existing rows without a table rewrite, so every existing WorkspaceSettings
-- row reads 90 immediately -- matching this column's application-level fallback too, so
-- the two can never disagree). consignmentMinimumPriceCents and Item.relistCapFlaggedAt
-- have no DEFAULT -- every existing row reads NULL, which is exactly the correct starting
-- state ("use the platform default" / "not yet flagged").
--
-- Down migration (safe at any time pre-launch of this feature):
--   DROP INDEX "Item_consignorId_status_relistCapFlaggedAt_idx";
--   ALTER TABLE "Item" DROP COLUMN "relistCapFlaggedAt";
--   ALTER TABLE "WorkspaceSettings" DROP COLUMN "maxRelistDays";
--   ALTER TABLE "WorkspaceSettings" DROP COLUMN "consignmentMinimumPriceCents";

ALTER TABLE "WorkspaceSettings" ADD COLUMN "consignmentMinimumPriceCents" INTEGER;
ALTER TABLE "WorkspaceSettings" ADD COLUMN "maxRelistDays" INTEGER DEFAULT 90;

ALTER TABLE "Item" ADD COLUMN "relistCapFlaggedAt" TIMESTAMP(3);

CREATE INDEX "Item_consignorId_status_relistCapFlaggedAt_idx" ON "Item"("consignorId", "status", "relistCapFlaggedAt");
