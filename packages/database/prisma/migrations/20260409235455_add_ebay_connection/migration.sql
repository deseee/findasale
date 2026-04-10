-- Create EbayConnection table
CREATE TABLE "EbayConnection" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizerId" TEXT NOT NULL UNIQUE,
  "accessToken" TEXT NOT NULL,
  "refreshToken" TEXT NOT NULL,
  "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
  "ebayUserId" TEXT NOT NULL,
  "ebayAccountEmail" TEXT,
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastRefreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastErrorAt" TIMESTAMP(3),
  "lastErrorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EbayConnection_organizerId_fkey"
    FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "EbayConnection_organizerId_idx" ON "EbayConnection"("organizerId");
CREATE INDEX "EbayConnection_lastRefreshedAt_idx" ON "EbayConnection"("lastRefreshedAt");

-- Add ebayListingId and listedOnEbayAt to Item table
ALTER TABLE "Item" ADD COLUMN "ebayListingId" TEXT;
ALTER TABLE "Item" ADD COLUMN "listedOnEbayAt" TIMESTAMP(3);
CREATE INDEX "Item_ebayListingId_idx" ON "Item"("ebayListingId");
