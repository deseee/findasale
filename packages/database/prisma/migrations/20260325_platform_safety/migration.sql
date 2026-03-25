-- Platform Safety P1 + P2 — Bidding Integrity & Buyer Transparency
-- #94: Same-IP Bidder Detection
-- #98: Chargeback Defense Documentation

-- Create BidIpRecord table for tracking IPs used in bids
CREATE TABLE "BidIpRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bidId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BidIpRecord_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "Bid" ("id") ON DELETE CASCADE,
    CONSTRAINT "BidIpRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE
);

-- Create indexes for BidIpRecord
CREATE INDEX "BidIpRecord_ipAddress_idx" ON "BidIpRecord"("ipAddress");
CREATE INDEX "BidIpRecord_userId_idx" ON "BidIpRecord"("userId");
CREATE INDEX "BidIpRecord_bidId_idx" ON "BidIpRecord"("bidId");

-- Create CheckoutEvidence table for chargeback defense
CREATE TABLE "CheckoutEvidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purchaseId" TEXT NOT NULL UNIQUE,
    "checkoutTimestamp" TIMESTAMP(3) NOT NULL,
    "emailSentAt" TIMESTAMP(3),
    "checkoutIp" TEXT,
    "acknowledgmentText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CheckoutEvidence_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE CASCADE
);

-- Create indexes for CheckoutEvidence
CREATE INDEX "CheckoutEvidence_purchaseId_idx" ON "CheckoutEvidence"("purchaseId");
CREATE INDEX "CheckoutEvidence_checkoutTimestamp_idx" ON "CheckoutEvidence"("checkoutTimestamp");
