-- AddColumn Item.ebayQueuedAt
ALTER TABLE "Item" ADD COLUMN "ebayQueuedAt" TIMESTAMP(3);
-- AddColumn Item.ebayListedAt
ALTER TABLE "Item" ADD COLUMN "ebayListedAt" TIMESTAMP(3);
-- AddColumn Organizer.ebayQueueMode
ALTER TABLE "Organizer" ADD COLUMN "ebayQueueMode" BOOLEAN NOT NULL DEFAULT false;
-- AddColumn Organizer.ebayQueueRotation
ALTER TABLE "Organizer" ADD COLUMN "ebayQueueRotation" BOOLEAN NOT NULL DEFAULT false;
