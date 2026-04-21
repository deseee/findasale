-- Migration: retail_gap_309_310_311
-- Features: #309 Consignor Portal & Payouts, #310 Color-tagged Discount Rules, #311 Multi-Location Inventory View
-- Session: S533 — 2026-04-21
-- All three features are TEAMS-tier only. All touch Item model — consolidated into one migration.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Create Consignor (must exist before Item FK change)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE "Consignor" (
    "id"             TEXT NOT NULL,
    "workspaceId"    TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "email"          TEXT,
    "phone"          TEXT,
    "commissionRate" DECIMAL(5,2) NOT NULL,
    "notes"          TEXT,
    "portalToken"    TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consignor_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Consignor_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "OrganizerWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Consignor_portalToken_key" ON "Consignor"("portalToken");
CREATE INDEX "Consignor_workspaceId_idx" ON "Consignor"("workspaceId");

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Create ConsignorPayout
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE "ConsignorPayout" (
    "id"               TEXT NOT NULL,
    "consignorId"      TEXT NOT NULL,
    "saleId"           TEXT,
    "totalSales"       DECIMAL(10,2) NOT NULL,
    "commissionAmount" DECIMAL(10,2) NOT NULL,
    "netPayout"        DECIMAL(10,2) NOT NULL,
    "method"           TEXT,
    "paidAt"           TIMESTAMP(3),
    "notes"            TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsignorPayout_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ConsignorPayout_consignorId_fkey" FOREIGN KEY ("consignorId") REFERENCES "Consignor"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ConsignorPayout_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ConsignorPayout_consignorId_idx" ON "ConsignorPayout"("consignorId");
CREATE INDEX "ConsignorPayout_saleId_idx" ON "ConsignorPayout"("saleId");

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Create DiscountRule
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE "DiscountRule" (
    "id"              TEXT NOT NULL,
    "workspaceId"     TEXT NOT NULL,
    "tagColor"        TEXT NOT NULL,
    "label"           TEXT NOT NULL,
    "discountPercent" DECIMAL(5,2) NOT NULL,
    "activeFrom"      TIMESTAMP(3),
    "activeTo"        TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscountRule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DiscountRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "OrganizerWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "DiscountRule_workspaceId_idx" ON "DiscountRule"("workspaceId");
CREATE INDEX "DiscountRule_workspaceId_tagColor_idx" ON "DiscountRule"("workspaceId", "tagColor");

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Create Location
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE "Location" (
    "id"          TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "address"     TEXT,
    "phone"       TEXT,
    "managerId"   TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Location_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "OrganizerWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Location_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "Location_workspaceId_idx" ON "Location"("workspaceId");

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Item: migrate consignorId FK from User → Consignor
-- ─────────────────────────────────────────────────────────────────────────────
-- Drop the old User FK constraint (pre-wire from Feature #70)
ALTER TABLE "Item" DROP CONSTRAINT IF EXISTS "Item_consignorId_fkey";

-- Nullify all existing values — old User IDs won't match Consignor IDs (safe: pre-wire only, no real data)
UPDATE "Item" SET "consignorId" = NULL WHERE "consignorId" IS NOT NULL;

-- Add new FK to Consignor
ALTER TABLE "Item" ADD CONSTRAINT "Item_consignorId_fkey"
    FOREIGN KEY ("consignorId") REFERENCES "Consignor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Item: add tagColor and locationId columns
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "tagColor" TEXT;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "locationId" TEXT;

ALTER TABLE "Item" ADD CONSTRAINT "Item_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Item_locationId_idx" ON "Item"("locationId");
CREATE INDEX IF NOT EXISTS "Item_consignorId_idx" ON "Item"("consignorId");
CREATE INDEX IF NOT EXISTS "Item_tagColor_idx" ON "Item"("tagColor");

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Sale: add locationId column
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "locationId" TEXT;

ALTER TABLE "Sale" ADD CONSTRAINT "Sale_locationId_fkey"
    FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Sale_locationId_idx" ON "Sale"("locationId");
