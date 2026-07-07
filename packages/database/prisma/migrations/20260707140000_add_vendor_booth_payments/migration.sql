-- Vendor Booth Payments — Flea Market Multi-Booth Checkout (2026-07-07)
-- ADR-015 (base checkout mechanic) + ADR-016 (real vendor accounts + distributed
-- Stripe payments) + ADR-017 (security fixes: tenancy join via existing
-- Organizer.workspace relation — no schema change needed for that fix; corrected
-- Transfer source_transaction logic — code-only, no schema change; new
-- assertBoothCartCheckoutAllowed guard — code-only, no schema change).
-- Decision log 2026-07-07 "Flea Market Vendor Payments: Unclaimed-Booth Checkout
-- Block + Separate Env Flag" — schema itself does not enforce the unclaimed-booth
-- checkout block (that's app-level in the cart add-items controller); this migration
-- only adds the tables/columns needed to represent VendorBooth.userId nullability.
--
-- Additive only. No destructive changes to any existing table. 0 rows affected in
-- any pre-existing table (Item.vendorBoothId / Purchase.boothCartTransactionId are
-- new nullable columns with no backfill needed).
--
-- DutyShift/DutyShiftClaim (ADR-015 Appendix) are explicitly OUT OF SCOPE — not
-- included in this migration.

-- AlterTable: Item — add vendorBoothId (sibling optional FK to consignorId)
ALTER TABLE "Item" ADD COLUMN "vendorBoothId" TEXT;
CREATE INDEX "Item_vendorBoothId_idx" ON "Item"("vendorBoothId");

-- AlterTable: Purchase — add boothCartTransactionId (roaming multi-booth cart attribution)
ALTER TABLE "Purchase" ADD COLUMN "boothCartTransactionId" TEXT;
CREATE INDEX "Purchase_boothCartTransactionId_idx" ON "Purchase"("boothCartTransactionId");

-- CreateTable: VendorBooth
CREATE TABLE "VendorBooth" (
    "id" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "userId" TEXT,
    "boothNumber" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "vendorEmail" TEXT,
    "vendorPhone" TEXT,
    "boothFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "revenueSharePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "stripeAccountId" TEXT,
    "stripeOnboarded" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "boothToken" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorBooth_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VendorBooth_boothToken_key" ON "VendorBooth"("boothToken");
CREATE UNIQUE INDEX "VendorBooth_hubId_boothNumber_key" ON "VendorBooth"("hubId", "boothNumber");
CREATE INDEX "VendorBooth_hubId_idx" ON "VendorBooth"("hubId");
CREATE INDEX "VendorBooth_status_idx" ON "VendorBooth"("status");
CREATE INDEX "VendorBooth_boothToken_idx" ON "VendorBooth"("boothToken");
CREATE INDEX "VendorBooth_userId_idx" ON "VendorBooth"("userId");
CREATE INDEX "VendorBooth_stripeAccountId_idx" ON "VendorBooth"("stripeAccountId");

ALTER TABLE "VendorBooth" ADD CONSTRAINT "VendorBooth_hubId_fkey"
    FOREIGN KEY ("hubId") REFERENCES "SaleHub"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorBooth" ADD CONSTRAINT "VendorBooth_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: BoothCartTransaction
CREATE TABLE "BoothCartTransaction" (
    "id" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "cashierTeamMemberId" TEXT,
    "cashierBoothId" TEXT,
    "stripePaymentIntentId" TEXT,
    "totalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "boothsRepresented" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoothCartTransaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BoothCartTransaction_hubId_idx" ON "BoothCartTransaction"("hubId");
CREATE INDEX "BoothCartTransaction_cashierTeamMemberId_idx" ON "BoothCartTransaction"("cashierTeamMemberId");
CREATE INDEX "BoothCartTransaction_cashierBoothId_idx" ON "BoothCartTransaction"("cashierBoothId");
CREATE INDEX "BoothCartTransaction_stripePaymentIntentId_idx" ON "BoothCartTransaction"("stripePaymentIntentId");

ALTER TABLE "BoothCartTransaction" ADD CONSTRAINT "BoothCartTransaction_hubId_fkey"
    FOREIGN KEY ("hubId") REFERENCES "SaleHub"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BoothCartTransaction" ADD CONSTRAINT "BoothCartTransaction_cashierTeamMemberId_fkey"
    FOREIGN KEY ("cashierTeamMemberId") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BoothCartTransaction" ADD CONSTRAINT "BoothCartTransaction_cashierBoothId_fkey"
    FOREIGN KEY ("cashierBoothId") REFERENCES "VendorBooth"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Now that BoothCartTransaction exists, wire Purchase.boothCartTransactionId's FK constraint
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_boothCartTransactionId_fkey"
    FOREIGN KEY ("boothCartTransactionId") REFERENCES "BoothCartTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Now that VendorBooth exists, wire Item.vendorBoothId's FK constraint
ALTER TABLE "Item" ADD CONSTRAINT "Item_vendorBoothId_fkey"
    FOREIGN KEY ("vendorBoothId") REFERENCES "VendorBooth"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: VendorBoothSettlementBatch
CREATE TABLE "VendorBoothSettlementBatch" (
    "id" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "totalGross" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalPayouts" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "VendorBoothSettlementBatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VendorBoothSettlementBatch_hubId_idx" ON "VendorBoothSettlementBatch"("hubId");
CREATE INDEX "VendorBoothSettlementBatch_status_idx" ON "VendorBoothSettlementBatch"("status");

ALTER TABLE "VendorBoothSettlementBatch" ADD CONSTRAINT "VendorBoothSettlementBatch_hubId_fkey"
    FOREIGN KEY ("hubId") REFERENCES "SaleHub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: VendorBoothPayout
CREATE TABLE "VendorBoothPayout" (
    "id" TEXT NOT NULL,
    "vendorBoothId" TEXT NOT NULL,
    "settlementBatchId" TEXT,
    "totalSales" DECIMAL(10,2) NOT NULL,
    "boothFeeCharged" DECIMAL(10,2) NOT NULL,
    "revenueShareOwed" DECIMAL(10,2) NOT NULL,
    "taxCollected" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "netPayout" DECIMAL(10,2) NOT NULL,
    "stripeTransferId" TEXT,
    "transferredAt" TIMESTAMP(3),
    "method" TEXT,
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorBoothPayout_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VendorBoothPayout_vendorBoothId_idx" ON "VendorBoothPayout"("vendorBoothId");
CREATE INDEX "VendorBoothPayout_settlementBatchId_idx" ON "VendorBoothPayout"("settlementBatchId");
CREATE INDEX "VendorBoothPayout_stripeTransferId_idx" ON "VendorBoothPayout"("stripeTransferId");

ALTER TABLE "VendorBoothPayout" ADD CONSTRAINT "VendorBoothPayout_vendorBoothId_fkey"
    FOREIGN KEY ("vendorBoothId") REFERENCES "VendorBooth"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorBoothPayout" ADD CONSTRAINT "VendorBoothPayout_settlementBatchId_fkey"
    FOREIGN KEY ("settlementBatchId") REFERENCES "VendorBoothSettlementBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
