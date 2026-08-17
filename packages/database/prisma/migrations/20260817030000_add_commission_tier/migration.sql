-- Migration: add_commission_tier
-- ADR-096: Value-tiered consignor commission ladder.
--
-- WHY THIS EXISTS: ADR-096 shipped its schema.prisma change (~2026-07-29) with NO
-- migration file. The deployed Prisma client has been selecting three objects that
-- do not exist in the database, hard-failing every query that projects them:
--   Consignor.useTieredCommission   -> ERROR 42703 column does not exist
--   ConsignorPayout.tierBreakdown   -> ERROR 42703 column does not exist
--   CommissionTier (table)          -> ERROR 42P01 relation does not exist
-- This restores schema/DB parity. It is PURELY ADDITIVE -- no DROP, no UPDATE,
-- no type change, no constraint removal. Safe on live tables with existing rows.
--
-- Feature stays OFF for every existing consignor: useTieredCommission defaults to
-- false, which is today's flat Consignor.commissionRate behavior, unchanged.

-- 1. Consignor.useTieredCommission  (schema.prisma:4634 -- Boolean @default(false))
ALTER TABLE "Consignor" ADD COLUMN IF NOT EXISTS "useTieredCommission" BOOLEAN NOT NULL DEFAULT false;

-- 2. ConsignorPayout.tierBreakdown  (schema.prisma:4673 -- Json?, nullable, no default)
ALTER TABLE "ConsignorPayout" ADD COLUMN IF NOT EXISTS "tierBreakdown" JSONB;

-- 3. CommissionTier -- one ladder per workspace (schema.prisma:4705-4716)
CREATE TABLE IF NOT EXISTS "CommissionTier" (
    "id"            TEXT NOT NULL,
    "workspaceId"   TEXT NOT NULL,
    "minPrice"      DECIMAL(10,2) NOT NULL,
    "maxPrice"      DECIMAL(10,2),
    "consignorRate" DECIMAL(5,2) NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionTier_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CommissionTier_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "OrganizerWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CommissionTier_workspaceId_idx" ON "CommissionTier"("workspaceId");
