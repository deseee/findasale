-- ADR-135: Etsy connector tables and MarketplaceAccount columns. Additive and idempotent.
-- SAFETY: apply BEFORE deploying the matching backend build. No data is rewritten.

ALTER TABLE "MarketplaceAccount" ADD COLUMN IF NOT EXISTS "externalShopId" TEXT;
ALTER TABLE "MarketplaceAccount" ADD COLUMN IF NOT EXISTS "grantedScopes" TEXT;
ALTER TABLE "MarketplaceAccount" ADD COLUMN IF NOT EXISTS "refreshTokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "MarketplaceAccount" ADD COLUMN IF NOT EXISTS "refreshLeaseUntil" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "EtsyShopSettings" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "marketplaceAccountId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "shopName" TEXT,
    "shopCurrency" TEXT,
    "defaultShippingProfileId" TEXT,
    "defaultReturnPolicyId" TEXT,
    "defaultReadinessStateId" TEXT,
    "receiptCursor" TIMESTAMP(3),
    "lastReceiptPollAt" TIMESTAMP(3),
    "lastWebhookAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EtsyShopSettings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "EtsyShopSettings_organizerId_key" ON "EtsyShopSettings"("organizerId");
CREATE UNIQUE INDEX IF NOT EXISTS "EtsyShopSettings_marketplaceAccountId_key" ON "EtsyShopSettings"("marketplaceAccountId");
CREATE INDEX IF NOT EXISTS "EtsyShopSettings_shopId_idx" ON "EtsyShopSettings"("shopId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EtsyShopSettings_marketplaceAccountId_fkey') THEN
    ALTER TABLE "EtsyShopSettings" ADD CONSTRAINT "EtsyShopSettings_marketplaceAccountId_fkey"
      FOREIGN KEY ("marketplaceAccountId") REFERENCES "MarketplaceAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "EtsyOAuthState" (
    "id" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeVerifierEnc" TEXT NOT NULL,
    "requestedScopes" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EtsyOAuthState_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "EtsyOAuthState_stateHash_key" ON "EtsyOAuthState"("stateHash");
CREATE INDEX IF NOT EXISTS "EtsyOAuthState_organizerId_idx" ON "EtsyOAuthState"("organizerId");
CREATE INDEX IF NOT EXISTS "EtsyOAuthState_expiresAt_idx" ON "EtsyOAuthState"("expiresAt");

CREATE TABLE IF NOT EXISTS "EtsyListing" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "etsyListingId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'PREPARING',
    "failedStep" TEXT,
    "lastErrorMessage" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "whenMade" TEXT NOT NULL,
    "whoMade" TEXT NOT NULL DEFAULT 'someone_else',
    "isSupply" BOOLEAN NOT NULL DEFAULT false,
    "taxonomyId" INTEGER,
    "shippingProfileId" TEXT,
    "returnPolicyId" TEXT,
    "readinessStateId" TEXT,
    "imagesUploaded" INTEGER NOT NULL DEFAULT 0,
    "syncedQuantity" INTEGER,
    "syncedPrice" DOUBLE PRECISION,
    "attestedAt" TIMESTAMP(3),
    "attestedByUserId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EtsyListing_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "EtsyListing_itemId_key" ON "EtsyListing"("itemId");
CREATE INDEX IF NOT EXISTS "EtsyListing_organizerId_state_idx" ON "EtsyListing"("organizerId", "state");
CREATE INDEX IF NOT EXISTS "EtsyListing_state_updatedAt_idx" ON "EtsyListing"("state", "updatedAt");
CREATE INDEX IF NOT EXISTS "EtsyListing_etsyListingId_idx" ON "EtsyListing"("etsyListingId");
CREATE INDEX IF NOT EXISTS "EtsyListing_shopId_idx" ON "EtsyListing"("shopId");

CREATE TABLE IF NOT EXISTS "EtsySoldEvent" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "etsyListingId" TEXT NOT NULL,
    "itemId" TEXT,
    "quantity" INTEGER NOT NULL,
    "soldAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EtsySoldEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "EtsySoldEvent_transactionId_key" ON "EtsySoldEvent"("transactionId");
CREATE INDEX IF NOT EXISTS "EtsySoldEvent_itemId_idx" ON "EtsySoldEvent"("itemId");
CREATE INDEX IF NOT EXISTS "EtsySoldEvent_etsyListingId_idx" ON "EtsySoldEvent"("etsyListingId");

CREATE TABLE IF NOT EXISTS "EtsyApiCall" (
    "id" SERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "priority" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "organizerId" TEXT,
    "status" INTEGER,
    CONSTRAINT "EtsyApiCall_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "EtsyApiCall_at_idx" ON "EtsyApiCall"("at");

CREATE TABLE IF NOT EXISTS "EtsyApiState" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "limitPerDay" INTEGER,
    "remainingToday" INTEGER,
    "limitPerSecond" INTEGER,
    "observedAt" TIMESTAMP(3),
    "blockedUntil" TIMESTAMP(3),
    "blockedReason" TEXT,
    "lastAlertAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EtsyApiState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EtsyTaxonomyNode" (
    "id" INTEGER NOT NULL,
    "parentId" INTEGER,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "isLeaf" BOOLEAN NOT NULL,
    "fullPath" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EtsyTaxonomyNode_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "EtsyTaxonomyNode_parentId_idx" ON "EtsyTaxonomyNode"("parentId");
