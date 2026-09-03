-- Migration: add_curio_scan
-- Curio ("Scout") resale-value scanner backend (roadmap #636), Phases 1-4.
-- Purely additive: one new table, no changes to any existing table.
-- Hand-written to match schema.prisma's CurioScan model exactly (see model at
-- packages/database/prisma/schema.prisma) -- generated via `prisma db execute`
-- path rather than `prisma migrate dev`, because the local shadow-database
-- validation step failed on an unrelated pre-existing migration
-- (20260707100000_add_pgvector_product_reference, requires the Postgres
-- "vector" extension, not installed on this machine's local Postgres 17).
-- This file is applied the normal way via `prisma migrate deploy` (which does
-- NOT use a shadow database), so migration history stays consistent with
-- every other migration in this project.

CREATE TABLE IF NOT EXISTS "CurioScan" (
    "id"                        TEXT NOT NULL,
    "userId"                    TEXT NOT NULL,
    "sourceSurface"             TEXT NOT NULL,
    "photoUrls"                 TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "title"                     TEXT NOT NULL,
    "description"               TEXT,
    "category"                  TEXT,
    "brand"                     TEXT,
    "condition"                 TEXT,
    "aiConfidence"              DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "priceLow"                  INTEGER,
    "priceHigh"                 INTEGER,
    "priceMedian"               INTEGER,
    "valueBasis"                TEXT DEFAULT 'similar_active_listings',
    "comparableListings"        JSONB,
    "dealCheckVerdict"          TEXT,
    "dealCheckAskingPriceCents" INTEGER,
    "dealCheckSourceDomain"     TEXT,
    "convertedToItemId"         TEXT,
    "convertedAt"               TIMESTAMP(3),
    "guildXpAwarded"            INTEGER NOT NULL DEFAULT 0,
    "createdAt"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt"                 TIMESTAMP(3),

    CONSTRAINT "CurioScan_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CurioScan_convertedToItemId_key" UNIQUE ("convertedToItemId"),
    CONSTRAINT "CurioScan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CurioScan_convertedToItemId_fkey" FOREIGN KEY ("convertedToItemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CurioScan_userId_idx" ON "CurioScan"("userId");
CREATE INDEX IF NOT EXISTS "CurioScan_createdAt_idx" ON "CurioScan"("createdAt");
CREATE INDEX IF NOT EXISTS "CurioScan_convertedToItemId_idx" ON "CurioScan"("convertedToItemId");
