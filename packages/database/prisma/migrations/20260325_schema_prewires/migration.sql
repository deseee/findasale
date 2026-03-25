-- Feature #83: Estate Planning — add executorUserId to Organizer
ALTER TABLE "Organizer" ADD COLUMN "executorUserId" TEXT;

-- Feature #81: Persistent Inventory — add isPersistent to Item
ALTER TABLE "Item" ADD COLUMN "isPersistent" BOOLEAN NOT NULL DEFAULT false;

-- Feature #84: Affiliate Code — create AffiliateCode table
CREATE TABLE "AffiliateCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AffiliateCode_code_key" UNIQUE ("code")
);
