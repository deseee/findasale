-- Unique / idempotency keys (2026-11-05, database schema review 2026-11-04 items #2, #8 partial, #9).
--
-- WHAT: unique backstops for keys that must identify ONE row, so a retried webhook, a double-tapped submit or a
-- concurrent recorder can never write a second ledger row. Writers treat a P2002 on these as "already recorded"
-- (backend utils/uniqueViolation.ts) instead of answering 500.
--   Purchase (squarePaymentId, itemId)     partial: re-asserts the index from 20260907010000_square_migration_wave0_schema
--                                          (IF NOT EXISTS: a no-op wherever that migration already ran, i.e. production).
--   Purchase (clientTransactionId, itemId) partial: offline/cash POS replay key and bulk-lot pack attempt key.
--   Item.ebayListingId / Item.ebayOfferId  partial: one eBay listing / offer belongs to one item.
--   EtsyListing.etsyListingId              partial: one Etsy listing belongs to one EtsyListing row.
--   ShopifyListing (organizerId, shopifyProductId), PointsTransaction.idempotencyKey (new column),
--   SaleTransaction.purchaseId (new column), Coupon.redeemedPurchaseId: plain unique, declared in schema.prisma.
-- Partial indexes are raw SQL on purpose: Prisma 5 cannot declare a WHERE clause (same pattern as
-- Purchase_stripePaymentIntentId_itemId_unique). NULLs never conflict in any of these indexes.
--
-- LOCKING: plain CREATE INDEX (not CONCURRENTLY). Prisma runs a multi-statement migration as one implicit
-- transaction, where CONCURRENTLY is refused (25001); a CONCURRENTLY build would need one migration folder per
-- index. These tables are small (Item ~tens of thousands of rows, Purchase ~100, the rest smaller), so each build
-- holds a SHARE lock (reads continue, writes wait) for well under a second.
--
-- PRE-CHECK (run against production first; every query must return 0 rows, or this migration fails and rolls back):
--   SELECT "squarePaymentId", "itemId", count(*) FROM "Purchase" WHERE "squarePaymentId" IS NOT NULL AND "itemId" IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1;
--   SELECT "clientTransactionId", "itemId", count(*) FROM "Purchase" WHERE "clientTransactionId" IS NOT NULL AND "itemId" IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1;
--   SELECT "ebayListingId", count(*) FROM "Item" WHERE "ebayListingId" IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
--   SELECT "ebayOfferId", count(*) FROM "Item" WHERE "ebayOfferId" IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
--   SELECT "etsyListingId", count(*) FROM "EtsyListing" WHERE "etsyListingId" IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
--   SELECT "organizerId", "shopifyProductId", count(*) FROM "ShopifyListing" GROUP BY 1,2 HAVING count(*) > 1;
--   SELECT "redeemedPurchaseId", count(*) FROM "Coupon" WHERE "redeemedPurchaseId" IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
-- (2026-11-05 owner checks: Purchase pairs, Item.ebayListingId and Item.ebayOfferId already returned 0.)
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS "Purchase_clientTransactionId_itemId_unique", "Item_ebayListingId_unique", "Item_ebayOfferId_unique",
--     "EtsyListing_etsyListingId_unique", "ShopifyListing_organizerId_shopifyProductId_key", "PointsTransaction_idempotencyKey_key",
--     "SaleTransaction_purchaseId_key", "Coupon_redeemedPurchaseId_key";
--   ALTER TABLE "PointsTransaction" DROP COLUMN IF EXISTS "idempotencyKey"; ALTER TABLE "SaleTransaction" DROP COLUMN IF EXISTS "purchaseId";
--   (Keep Purchase_squarePaymentId_itemId_unique: it predates this migration.)

-- Purchase
CREATE UNIQUE INDEX IF NOT EXISTS "Purchase_squarePaymentId_itemId_unique"
  ON "Purchase" ("squarePaymentId", "itemId")
  WHERE "squarePaymentId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Purchase_clientTransactionId_itemId_unique"
  ON "Purchase" ("clientTransactionId", "itemId")
  WHERE "clientTransactionId" IS NOT NULL;

-- Item (eBay)
CREATE UNIQUE INDEX IF NOT EXISTS "Item_ebayListingId_unique"
  ON "Item" ("ebayListingId")
  WHERE "ebayListingId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Item_ebayOfferId_unique"
  ON "Item" ("ebayOfferId")
  WHERE "ebayOfferId" IS NOT NULL;

-- EtsyListing
CREATE UNIQUE INDEX IF NOT EXISTS "EtsyListing_etsyListingId_unique"
  ON "EtsyListing" ("etsyListingId")
  WHERE "etsyListingId" IS NOT NULL;

-- ShopifyListing (schema.prisma @@unique([organizerId, shopifyProductId]))
CREATE UNIQUE INDEX IF NOT EXISTS "ShopifyListing_organizerId_shopifyProductId_key"
  ON "ShopifyListing" ("organizerId", "shopifyProductId");

-- PointsTransaction.idempotencyKey (schema.prisma String? @unique)
ALTER TABLE "PointsTransaction" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "PointsTransaction_idempotencyKey_key" ON "PointsTransaction" ("idempotencyKey");

-- SaleTransaction.purchaseId (schema.prisma String? @unique)
ALTER TABLE "SaleTransaction" ADD COLUMN IF NOT EXISTS "purchaseId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "SaleTransaction_purchaseId_key" ON "SaleTransaction" ("purchaseId");

-- Coupon.redeemedPurchaseId (schema.prisma String? @unique)
CREATE UNIQUE INDEX IF NOT EXISTS "Coupon_redeemedPurchaseId_key" ON "Coupon" ("redeemedPurchaseId");
