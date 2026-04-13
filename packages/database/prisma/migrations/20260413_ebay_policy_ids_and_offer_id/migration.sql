-- Feature #244 Phase 2b: eBay business policy IDs + offer ID for sold sync
-- EbayConnection: store organizer's eBay business policy IDs (fetched after OAuth)
ALTER TABLE "EbayConnection" ADD COLUMN "paymentPolicyId" TEXT;
ALTER TABLE "EbayConnection" ADD COLUMN "fulfillmentPolicyId" TEXT;
ALTER TABLE "EbayConnection" ADD COLUMN "returnPolicyId" TEXT;
ALTER TABLE "EbayConnection" ADD COLUMN "policiesFetchedAt" TIMESTAMP(3);

-- Item: store eBay offer ID alongside existing ebayListingId (used to withdraw listing when item sells)
ALTER TABLE "Item" ADD COLUMN "ebayOfferId" TEXT;

-- Feature #244 Phase 3: Add lastEbaySoldSyncAt for eBay sold sync deduplication
ALTER TABLE "EbayConnection" ADD COLUMN "lastEbaySoldSyncAt" TIMESTAMP(3);
