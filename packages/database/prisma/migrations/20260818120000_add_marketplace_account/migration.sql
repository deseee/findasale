-- Migration: add_marketplace_account
-- Universal Crosslister -- Official-API Tier (Reverb first). Generalized per-organizer
-- marketplace OAuth/token connection table, additive only. Distinct from the existing
-- MarketplaceListingJob/MarketplacePosterAccount CONTENT-SCRIPT tier (Facebook/Craigslist/
-- Gumtree AU Playwright posting, added by earlier migrations) -- this is the official-API
-- OAuth tier, same shape family as EbayConnection/SocialAccount.
-- See claude_docs/architecture/ADR-DRAFT-universal-crosslister-buildout-2026-08-12.md
-- (ADDENDUM 2026-08-18) and packages/backend/src/services/marketplace/reverbConnector.ts.
--
-- accessToken/refreshToken store the ENCRYPTED envelope written/read exclusively through
-- reverbConnector.ts's encryptToken/decryptToken calls (tokenCrypto.ts) -- never plaintext,
-- unlike EbayConnection's known plaintext gap.

-- 1. MarketplaceConnectionPlatform enum -- single value today (REVERB); more platforms
--    added later via ALTER TYPE ... ADD VALUE IF NOT EXISTS, no new migration file needed
--    (same pattern as MarketplaceJobPlatform's GUMTREE_AU addition, ADR-102).
DO $$ BEGIN
  CREATE TYPE "MarketplaceConnectionPlatform" AS ENUM ('REVERB');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. MarketplaceConnectionStatus enum
DO $$ BEGIN
  CREATE TYPE "MarketplaceConnectionStatus" AS ENUM ('ACTIVE', 'NEEDS_REAUTH', 'REVOKED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. MarketplaceAccount table
CREATE TABLE IF NOT EXISTS "MarketplaceAccount" (
    "id"               TEXT NOT NULL,
    "organizerId"      TEXT NOT NULL,
    "platform"         "MarketplaceConnectionPlatform" NOT NULL,
    "status"           "MarketplaceConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "accessToken"      TEXT NOT NULL,
    "refreshToken"     TEXT,
    "tokenExpiresAt"   TIMESTAMP(3),
    "externalUserId"   TEXT,
    "connectedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRefreshedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastErrorAt"      TIMESTAMP(3),
    "lastErrorMessage" TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceAccount_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MarketplaceAccount_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "MarketplaceAccount_organizerId_platform_key" ON "MarketplaceAccount"("organizerId", "platform");
CREATE INDEX IF NOT EXISTS "MarketplaceAccount_organizerId_idx" ON "MarketplaceAccount"("organizerId");
CREATE INDEX IF NOT EXISTS "MarketplaceAccount_platform_status_idx" ON "MarketplaceAccount"("platform", "status");
