-- V3: UGC Missing-listing bounties
-- Shoppers request items they couldn't find; organizers can fulfill and link the listed item.

CREATE TABLE "MissingListingBounty" (
  "id"          TEXT                     NOT NULL,
  "saleId"      TEXT                     NOT NULL,
  "userId"      TEXT                     NOT NULL,
  "description" TEXT                     NOT NULL,
  "offerPrice"  DOUBLE PRECISION,
  "status"      TEXT                     NOT NULL DEFAULT 'OPEN',
  "itemId"      TEXT,
  "createdAt"   TIMESTAMP(3)             NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3)             NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MissingListingBounty_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MissingListingBounty"
  ADD CONSTRAINT "MissingListingBounty_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MissingListingBounty"
  ADD CONSTRAINT "MissingListingBounty_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MissingListingBounty"
  ADD CONSTRAINT "MissingListingBounty_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "MissingListingBounty_saleId_status_idx" ON "MissingListingBounty"("saleId", "status");
CREATE INDEX "MissingListingBounty_userId_idx"         ON "MissingListingBounty"("userId");