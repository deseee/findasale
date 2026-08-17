-- 20260817140000_reconcile_prod_drift_additive
--
-- PURPOSE: make a from-scratch replay of the migration history produce the same schema
-- production actually has. Every object below EXISTS IN PRODUCTION TODAY but is created by
-- NO migration file (verified 2026-08-17 read-only against Railway prod + a static replay of
-- all 372 local migration folders). On production this file is a proven no-op; on a fresh
-- database (CI, disaster recovery) it creates the objects for the first time.
--
-- ADDITIVE ONLY. Every statement is IF NOT EXISTS / IF EXISTS guarded and idempotent.
-- Nothing here drops, truncates, or rewrites data. Destructive counterparts live in
-- packages/database/prisma/manual/2026-08-17-drift-destructive-PENDING-APPROVAL.sql
-- and are NOT applied by `prisma migrate deploy`.
--
-- Companion doc: claude_docs/architecture/ADR-108-production-drift-reconciliation-2026-08-17.md

-- ---------------------------------------------------------------------------
-- 1. CityCoordinate -- prod-only TABLE, 6,313 live rows, declared in schema.prisma,
--    created by no migration. Backs cityCoordinateBackfillJob.ts + geocodingService.ts.
--    PRODUCTION WINS: live feature with live data.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "CityCoordinate" (
    "slug"       TEXT NOT NULL,
    "city"       TEXT NOT NULL,
    "state"      TEXT NOT NULL,
    "lat"        DOUBLE PRECISION NOT NULL,
    "lng"        DOUBLE PRECISION NOT NULL,
    "source"     TEXT NOT NULL,
    "geocodedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CityCoordinate_pkey" PRIMARY KEY ("slug")
);

CREATE INDEX IF NOT EXISTS "CityCoordinate_state_idx" ON "CityCoordinate"("state");

-- ---------------------------------------------------------------------------
-- 2. EbayPolicyMapping.cubicTierMappings -- prod-only COLUMN, declared in
--    schema.prisma:687, created by no migration. Read/written by ebayController.ts and
--    pages/organizer/settings/ebay.tsx. PRODUCTION WINS: live eBay shipping-policy feature.
--    Type/default copied verbatim from the live column (jsonb NOT NULL DEFAULT '[]'::jsonb).
-- ---------------------------------------------------------------------------
ALTER TABLE "EbayPolicyMapping"
  ADD COLUMN IF NOT EXISTS "cubicTierMappings" JSONB NOT NULL DEFAULT '[]';

-- ---------------------------------------------------------------------------
-- 3. Enum values added to production by bare `ALTER TYPE ... ADD VALUE` with no migration file.
--    All four are live: SocialPlatform TIKTOK/BLUESKY (ADR-077/ADR-105 social posting),
--    MarketplaceJobPlatform GUMTREE_AU (ADR-102 -- schema.prisma even documents the missing
--    migration in a comment), OutreachAuditEvent ORGANIZER_PAGE_VIEWED (outreach audit trail).
--    PRODUCTION WINS in all four cases: rows already carry these values.
--
--    BEFORE 'THREADS' is deliberate -- it reproduces production's exact enum sort order
--    (X, YOUTUBE, INSTAGRAM, FACEBOOK_PAGE, PINTEREST, TIKTOK, BLUESKY, THREADS). A bare
--    ADD VALUE would append after THREADS and leave a fresh DB ordered differently from prod.
--    Safe inside Prisma's per-file transaction on PG 12+ (values are added, never used here).
-- ---------------------------------------------------------------------------
ALTER TYPE "SocialPlatform"          ADD VALUE IF NOT EXISTS 'TIKTOK'  BEFORE 'THREADS';
ALTER TYPE "SocialPlatform"          ADD VALUE IF NOT EXISTS 'BLUESKY' BEFORE 'THREADS';
ALTER TYPE "MarketplaceJobPlatform"  ADD VALUE IF NOT EXISTS 'GUMTREE_AU';
ALTER TYPE "OutreachAuditEvent"      ADD VALUE IF NOT EXISTS 'ORGANIZER_PAGE_VIEWED';

-- ---------------------------------------------------------------------------
-- 4. Indexes present in production, created by no migration. All are hand-added performance
--    indexes on live query paths. PRODUCTION WINS: they are load-bearing today, and a fresh
--    DB without them silently regresses those queries.
--    (CityCoordinate_state_idx is created in section 1 with its table.)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "MetroTopFinds_metro_idx"    ON "MetroTopFinds"("metro");
CREATE INDEX IF NOT EXISTS "MetroTopFinds_soldAt_idx"   ON "MetroTopFinds"("soldAt");
CREATE INDEX IF NOT EXISTS "MetroTopFinds_citySlug_idx" ON "MetroTopFinds"("citySlug");
CREATE INDEX IF NOT EXISTS "ReferralReward_createdAt_idx" ON "ReferralReward"("createdAt");
CREATE INDEX IF NOT EXISTS "SocialPost_videoJobId_idx"  ON "SocialPost"("videoJobId");
