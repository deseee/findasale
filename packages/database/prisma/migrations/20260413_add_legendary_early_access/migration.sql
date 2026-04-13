-- Phase 2b: Legendary Early Access — Explorer's Guild rank perks
-- Add Legendary item fields to Item model for early access visibility control

ALTER TABLE "Item" ADD COLUMN "isLegendary" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Item" ADD COLUMN "legendaryVisibleAt" TIMESTAMP;
ALTER TABLE "Item" ADD COLUMN "legendaryPublishedAt" TIMESTAMP;

-- Create index for efficient query filtering on legendary visibility
CREATE INDEX "Item_isLegendary_legendaryVisibleAt_idx" ON "Item"("isLegendary", "legendaryVisibleAt");
