-- Multi-Source Pricing Engine Schema (Phase 1)
-- Author: FindA.Sale Architect
-- Date: 2026-04-25

-- 1. PricingSourceConfig — Feature flags for all sources
CREATE TABLE "PricingSourceConfig" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sourceId" TEXT NOT NULL UNIQUE,
  "enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "tier" INTEGER,
  "apiKey" TEXT,
  "apiQuotaDaily" INTEGER,
  "apiUsedToday" INTEGER NOT NULL DEFAULT 0,
  "lastResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "costPerCall" DOUBLE PRECISION,
  "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  "disabledAt" TIMESTAMP(3),
  "lastFailureAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE INDEX "PricingSourceConfig_sourceId_idx" ON "PricingSourceConfig"("sourceId");
CREATE INDEX "PricingSourceConfig_tier_enabled_idx" ON "PricingSourceConfig"("tier", "enabled");

-- 2. BrandException — Brands/patterns that hold or appreciate
CREATE TABLE "BrandException" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "brand" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "appreciationMode" TEXT NOT NULL DEFAULT 'APPRECIATION',
  "depreciationRate" DOUBLE PRECISION,
  "trendMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "notes" TEXT,
  "sources" TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE INDEX "BrandException_brand_idx" ON "BrandException"("brand");
CREATE INDEX "BrandException_category_idx" ON "BrandException"("category");
CREATE INDEX "BrandException_appreciationMode_idx" ON "BrandException"("appreciationMode");

-- 3. SleeperPattern — AI-detected collectible patterns in photos
CREATE TABLE "SleeperPattern" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "patternName" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "indicatorTokens" TEXT[],
  "confirmationPrompt" TEXT NOT NULL,
  "priceMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
  "linkedBrand" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE INDEX "SleeperPattern_category_idx" ON "SleeperPattern"("category");
CREATE INDEX "SleeperPattern_patternName_idx" ON "SleeperPattern"("patternName");

-- 4. PricingComp — Cached comparable sales from all sources
CREATE TABLE "PricingComp" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "itemId" TEXT,
  "sourceId" TEXT NOT NULL,
  "externalListingId" TEXT NOT NULL,
  "externalUrl" TEXT,
  "title" TEXT NOT NULL,
  "price" BIGINT NOT NULL,
  "isSoldPrice" BOOLEAN NOT NULL DEFAULT TRUE,
  "saleDate" TIMESTAMP(3) NOT NULL,
  "condition" TEXT,
  "category" TEXT,
  "brand" TEXT,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "sampleSize" INTEGER NOT NULL DEFAULT 1,
  "comparabilityScore" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
  "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expireAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "PricingComp_itemId_idx" ON "PricingComp"("itemId");
CREATE INDEX "PricingComp_sourceId_idx" ON "PricingComp"("sourceId");
CREATE INDEX "PricingComp_saleDate_idx" ON "PricingComp"("saleDate");
CREATE INDEX "PricingComp_expireAt_idx" ON "PricingComp"("expireAt");
CREATE UNIQUE INDEX "PricingComp_sourceId_externalListingId_key" ON "PricingComp"("sourceId", "externalListingId");

-- 5. TrendSignal — Google Trends + eBay momentum signals
CREATE TABLE "TrendSignal" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "category" TEXT NOT NULL,
  "searchTerm" TEXT NOT NULL,
  "signal" TEXT NOT NULL,
  "trendType" TEXT NOT NULL,
  "trendStrength" DOUBLE PRECISION NOT NULL,
  "dataPoints" INTEGER NOT NULL,
  "period" TEXT NOT NULL,
  "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expireAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "TrendSignal_category_idx" ON "TrendSignal"("category");
CREATE INDEX "TrendSignal_signal_idx" ON "TrendSignal"("signal");
CREATE INDEX "TrendSignal_trendType_idx" ON "TrendSignal"("trendType");
CREATE INDEX "TrendSignal_expireAt_idx" ON "TrendSignal"("expireAt");

-- 6. CategoryDepreciation — Depreciation curves per category
CREATE TABLE "CategoryDepreciation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "category" TEXT NOT NULL UNIQUE,
  "baseAgeYears" INTEGER NOT NULL DEFAULT 1,
  "baseRetentionRate" DOUBLE PRECISION NOT NULL DEFAULT 0.80,
  "curve" TEXT NOT NULL DEFAULT 'EXPONENTIAL',
  "minRetentionRate" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
  "specialCases" TEXT[],
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE INDEX "CategoryDepreciation_category_idx" ON "CategoryDepreciation"("category");

-- 7. Extend ItemCompLookup with pricing engine fields
ALTER TABLE "ItemCompLookup" ADD COLUMN IF NOT EXISTS "pricingResultJson" JSONB;
ALTER TABLE "ItemCompLookup" ADD COLUMN IF NOT EXISTS "estimatedPrice" BIGINT;
ALTER TABLE "ItemCompLookup" ADD COLUMN IF NOT EXISTS "priceConfidence" TEXT;
ALTER TABLE "ItemCompLookup" ADD COLUMN IF NOT EXISTS "tierUsed" INTEGER;
ALTER TABLE "ItemCompLookup" ADD COLUMN IF NOT EXISTS "sourcesConsulted" TEXT[];
ALTER TABLE "ItemCompLookup" ADD COLUMN IF NOT EXISTS "isTrending" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "ItemCompLookup" ADD COLUMN IF NOT EXISTS "trendMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0;
ALTER TABLE "ItemCompLookup" ADD COLUMN IF NOT EXISTS "isBrandPremium" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "ItemCompLookup" ADD COLUMN IF NOT EXISTS "brandPremiumName" TEXT;
ALTER TABLE "ItemCompLookup" ADD COLUMN IF NOT EXISTS "isSleeperDetected" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "ItemCompLookup" ADD COLUMN IF NOT EXISTS "sleeperCategory" TEXT;
ALTER TABLE "ItemCompLookup" ADD COLUMN IF NOT EXISTS "isAppreciating" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "ItemCompLookup" ADD COLUMN IF NOT EXISTS "depreciationCurveApplied" TEXT;
ALTER TABLE "ItemCompLookup" ADD COLUMN IF NOT EXISTS "compsFound" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ItemCompLookup" ADD COLUMN IF NOT EXISTS "dataFreshness" TIMESTAMP(3);

-- Seed: PricingSourceConfig (all sources, initial state)
INSERT INTO "PricingSourceConfig"
  ("id", "sourceId", "enabled", "tier", "apiQuotaDaily", "apiUsedToday", "lastResetAt", "consecutiveFailures", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'pricecharting', TRUE, 1, NULL, 0, now(), 0, now(), now()),
  (gen_random_uuid()::text, 'ebay', TRUE, 1, 5000, 0, now(), 0, now(), now()),
  (gen_random_uuid()::text, 'ebth', TRUE, 1, 200, 0, now(), 0, now(), now()),
  (gen_random_uuid()::text, 'keepa', TRUE, 1, 250, 0, now(), 0, now(), now()),
  (gen_random_uuid()::text, 'discogs', TRUE, 1, 1000, 0, now(), 0, now(), now()),
  (gen_random_uuid()::text, 'gsa', TRUE, 2, 100, 0, now(), 0, now(), now()),
  (gen_random_uuid()::text, 'salvationArmy', TRUE, 3, NULL, 0, now(), 0, now(), now()),
  (gen_random_uuid()::text, 'maxsold', FALSE, 1, NULL, 0, now(), 0, now(), now()),
  (gen_random_uuid()::text, 'hibid', FALSE, 1, NULL, 0, now(), 0, now(), now()),
  (gen_random_uuid()::text, 'bstock', FALSE, 2, NULL, 0, now(), 0, now(), now()),
  (gen_random_uuid()::text, 'worthpoint', FALSE, 2, NULL, 0, now(), 0, now(), now()),
  (gen_random_uuid()::text, 'storageTreasures', FALSE, 2, NULL, 0, now(), 0, now(), now()),
  (gen_random_uuid()::text, 'offerup', FALSE, 2, NULL, 0, now(), 0, now(), now()),
  (gen_random_uuid()::text, 'stockx', FALSE, 1, NULL, 0, now(), 0, now(), now());

-- Seed: CategoryDepreciation (12 curves)
INSERT INTO "CategoryDepreciation"
  ("id", "category", "baseAgeYears", "baseRetentionRate", "curve", "minRetentionRate", "specialCases", "notes", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'Furniture', 1, 0.85, 'EXPONENTIAL', 0.10, ARRAY['BRAND_PREMIUM', 'SLEEPER_DETECTION'], 'Mid-century modern holds value; brand premium applies', now(), now()),
  (gen_random_uuid()::text, 'Electronics', 1, 0.50, 'EXPONENTIAL', 0.05, ARRAY['BRAND_PREMIUM'], 'Rapid depreciation; faster decay = 0.1/day', now(), now()),
  (gen_random_uuid()::text, 'Tools', 1, 0.80, 'EXPONENTIAL', 0.15, ARRAY['BRAND_PREMIUM'], 'Brand-name tools (DeWalt, Milwaukee) retain value', now(), now()),
  (gen_random_uuid()::text, 'Appliances', 1, 0.70, 'EXPONENTIAL', 0.10, ARRAY['BRAND_PREMIUM'], 'Slower depreciation; brand premium (Vitamix, All-Clad)', now(), now()),
  (gen_random_uuid()::text, 'Clothing', 1, 0.30, 'EXPONENTIAL', 0.02, ARRAY['BRAND_PREMIUM', 'SLEEPER_DETECTION'], 'Fast depreciation; designer/vintage premium', now(), now()),
  (gen_random_uuid()::text, 'Collectibles', 1, 0.95, 'LINEAR', 0.50, ARRAY['BRAND_PREMIUM'], 'Very slow depreciation; appreciates with trends', now(), now()),
  (gen_random_uuid()::text, 'Vinyl', 1, 0.90, 'LINEAR', 0.60, ARRAY['BRAND_PREMIUM', 'SLEEPER_DETECTION'], 'Discogs handles; rare pressings appreciate', now(), now()),
  (gen_random_uuid()::text, 'Glassware', 1, 0.80, 'LINEAR', 0.20, ARRAY['BRAND_PREMIUM', 'SLEEPER_DETECTION'], 'Pyrex patterns, Fiesta, depression glass patterns hold value', now(), now()),
  (gen_random_uuid()::text, 'Cast Iron', 1, 0.95, 'LINEAR', 0.70, ARRAY['BRAND_PREMIUM', 'SLEEPER_DETECTION'], 'Griswold, Wagner appreciates; rare years premium', now(), now()),
  (gen_random_uuid()::text, 'Art', 1, 0.88, 'LINEAR', 0.40, ARRAY['BRAND_PREMIUM'], 'Mid-century artwork appreciates; artist matters', now(), now()),
  (gen_random_uuid()::text, 'Jewelry', 1, 0.92, 'LINEAR', 0.60, ARRAY['BRAND_PREMIUM'], 'Gold/diamonds hold value; designer premium', now(), now()),
  (gen_random_uuid()::text, 'Books', 1, 0.45, 'EXPONENTIAL', 0.05, ARRAY['BRAND_PREMIUM'], 'Fast depreciation; collectible editions hold value', now(), now());

-- Seed: BrandException (top 30 priority brands)
INSERT INTO "BrandException"
  ("id", "brand", "category", "appreciationMode", "trendMultiplier", "notes", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'Herman Miller', 'Furniture', 'APPRECIATION', 1.2, 'Modern furniture brand; mid-century pieces appreciate', now(), now()),
  (gen_random_uuid()::text, 'Eames', 'Furniture', 'APPRECIATION', 1.25, 'Design classics; high demand from collectors', now(), now()),
  (gen_random_uuid()::text, 'Knoll', 'Furniture', 'APPRECIATION', 1.15, 'Modern furniture; premium designer pieces', now(), now()),
  (gen_random_uuid()::text, 'Le Creuset', 'Cookware', 'APPRECIATION', 1.1, 'Enameled cast iron; collectible colors, limited editions appreciate', now(), now()),
  (gen_random_uuid()::text, 'All-Clad', 'Cookware', 'HOLD', 1.0, 'High-end cookware; stable resale value', now(), now()),
  (gen_random_uuid()::text, 'Vitamix', 'Appliances', 'HOLD', 1.0, 'Premium blender; strong resale market', now(), now()),
  (gen_random_uuid()::text, 'KitchenAid', 'Appliances', 'HOLD', 1.0, 'Stand mixers; collectible colors command premium', now(), now()),
  (gen_random_uuid()::text, 'Griswold', 'Cast Iron', 'APPRECIATION', 1.5, 'Rare production marks; vintage years appreciate 50-300%', now(), now()),
  (gen_random_uuid()::text, 'Wagner Ware', 'Cast Iron', 'APPRECIATION', 1.3, 'High-quality vintage cast iron; collectible', now(), now()),
  (gen_random_uuid()::text, 'Lodge', 'Cast Iron', 'HOLD', 1.0, 'Modern production; stable value', now(), now()),
  (gen_random_uuid()::text, 'Pyrex', 'Glassware', 'APPRECIATION', 1.2, 'Collectible patterns; eBay momentum strong', now(), now()),
  (gen_random_uuid()::text, 'Fiestaware', 'Glassware', 'APPRECIATION', 1.25, 'Art Deco dishware; vintage colors highly sought', now(), now()),
  (gen_random_uuid()::text, 'Waterford', 'Glassware', 'HOLD', 1.0, 'Crystal; stable high value', now(), now()),
  (gen_random_uuid()::text, 'Vintage Levi''s 501', 'Clothing', 'APPRECIATION', 1.4, 'Rare waist tags, red tab; vintage years 1950s-60s appreciate', now(), now()),
  (gen_random_uuid()::text, 'Patagonia', 'Clothing', 'HOLD', 1.0, 'Outdoor brand; strong resale market', now(), now()),
  (gen_random_uuid()::text, 'Coach Vintage', 'Accessories', 'APPRECIATION', 1.15, 'Leather goods; vintage Coach appreciates', now(), now()),
  (gen_random_uuid()::text, 'Dooney & Bourke Vintage', 'Accessories', 'APPRECIATION', 1.1, 'Vintage leather handbags appreciate', now(), now()),
  (gen_random_uuid()::text, 'DeWalt', 'Tools', 'HOLD', 1.0, 'Professional-grade; strong resale', now(), now()),
  (gen_random_uuid()::text, 'Milwaukee', 'Tools', 'HOLD', 1.0, 'Premium power tools; M18 battery compatibility premium', now(), now()),
  (gen_random_uuid()::text, 'Snap-on', 'Tools', 'HOLD', 1.0, 'Professional tools; premium pricing', now(), now()),
  (gen_random_uuid()::text, 'McCoy Pottery', 'Pottery', 'APPRECIATION', 1.3, 'Art pottery; glazes, maker marks command premium', now(), now()),
  (gen_random_uuid()::text, 'Roseville Pottery', 'Pottery', 'APPRECIATION', 1.35, 'Art pottery; vintage patterns highly collectible', now(), now()),
  (gen_random_uuid()::text, 'Fire-King Jadeite', 'Glassware', 'APPRECIATION', 1.3, 'Vintage glassware; jadeite color highly sought', now(), now()),
  (gen_random_uuid()::text, 'Depression Glass', 'Glassware', 'APPRECIATION', 1.25, 'Pre-1940 glassware; premium for rare patterns', now(), now()),
  (gen_random_uuid()::text, 'Steiff Teddy Bears', 'Collectibles', 'APPRECIATION', 1.2, 'Early bears with button in ear highly collectible', now(), now()),
  (gen_random_uuid()::text, 'Lionel Trains', 'Collectibles', 'APPRECIATION', 1.2, 'Vintage Lionel trains; 1940s-50s models appreciate', now(), now()),
  (gen_random_uuid()::text, 'Matchbox Vintage', 'Collectibles', 'APPRECIATION', 1.15, 'Original 1960s-70s Matchbox cars appreciate', now(), now()),
  (gen_random_uuid()::text, 'Hot Wheels Vintage', 'Collectibles', 'APPRECIATION', 1.2, 'Early Hot Wheels; rare colors command premium', now(), now()),
  (gen_random_uuid()::text, 'Barbie Vintage', 'Collectibles', 'APPRECIATION', 1.3, '#1 Barbie and early versions highly sought', now(), now()),
  (gen_random_uuid()::text, 'Tiffany & Co', 'Jewelry', 'HOLD', 1.0, 'High-end jewelry; stable premium value', now(), now());

-- Seed: SleeperPattern (20 key patterns)
INSERT INTO "SleeperPattern"
  ("id", "patternName", "category", "indicatorTokens", "confirmationPrompt", "priceMultiplier", "linkedBrand", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'Griswold Cast Iron Markings', 'Cast Iron', ARRAY['griswold', 'maker mark', 'cast mark'], 'Does this cast iron show Griswold production markings on the bottom or handle?', 1.5, 'Griswold', now(), now()),
  (gen_random_uuid()::text, 'Wagner Ware Vintage', 'Cast Iron', ARRAY['wagner', 'wagner ware', 'vintage mark'], 'Is this marked Wagner Ware with pre-1970 production date?', 1.4, 'Wagner Ware', now(), now()),
  (gen_random_uuid()::text, 'Pyrex Butterfly Pattern', 'Glassware', ARRAY['pyrex', 'butterfly', 'pattern'], 'Does this glassware show Pyrex Butterfly pattern (gold or pink butterflies)?', 1.6, 'Pyrex', now(), now()),
  (gen_random_uuid()::text, 'Pyrex Gold Leaf Pattern', 'Glassware', ARRAY['pyrex', 'gold', 'leaf', 'pattern'], 'Does this Pyrex show Gold Leaf or other rare pattern?', 1.5, 'Pyrex', now(), now()),
  (gen_random_uuid()::text, 'Pyrex Gooseberry Pattern', 'Glassware', ARRAY['pyrex', 'gooseberry', 'berries'], 'Does this Pyrex display Gooseberry pattern with berries?', 1.5, 'Pyrex', now(), now()),
  (gen_random_uuid()::text, 'Pyrex Lucky in Love', 'Glassware', ARRAY['pyrex', 'lucky', 'love'], 'Does this show Pyrex Lucky in Love pattern?', 1.5, 'Pyrex', now(), now()),
  (gen_random_uuid()::text, 'Pyrex Balloons Pattern', 'Glassware', ARRAY['pyrex', 'balloons', 'pattern'], 'Does this Pyrex show Balloons pattern?', 1.4, 'Pyrex', now(), now()),
  (gen_random_uuid()::text, 'Fiestaware Discontinued Color', 'Glassware', ARRAY['fiestaware', 'vintage', 'color'], 'Is this Fiestaware in a discontinued color (red, cobalt, turquoise)?', 1.5, 'Fiestaware', now(), now()),
  (gen_random_uuid()::text, 'Fire-King Jadeite Glass', 'Glassware', ARRAY['fire king', 'jadeite', 'green'], 'Is this Fire-King glassware in signature jadeite (light green) color?', 1.5, 'Fire-King', now(), now()),
  (gen_random_uuid()::text, 'Hull Pottery Mark', 'Pottery', ARRAY['hull', 'pottery', 'mark'], 'Does this pottery show Hull Pottery maker mark?', 1.4, NULL, now(), now()),
  (gen_random_uuid()::text, 'Roseville Pottery Mark', 'Pottery', ARRAY['roseville', 'mark', 'pottery'], 'Is this marked Roseville Pottery with visible maker stamp?', 1.5, 'Roseville Pottery', now(), now()),
  (gen_random_uuid()::text, 'McCoy Pottery Mark', 'Pottery', ARRAY['mccoy', 'pottery', 'mark'], 'Does this show McCoy Pottery maker mark?', 1.4, 'McCoy Pottery', now(), now()),
  (gen_random_uuid()::text, 'Depression Glass Pattern', 'Glassware', ARRAY['depression glass', 'pattern', 'vintage'], 'Is this Depression Glass with a recognizable pattern from 1920s-40s?', 1.3, 'Depression Glass', now(), now()),
  (gen_random_uuid()::text, 'Carnival Glass Pattern', 'Glassware', ARRAY['carnival', 'glass', 'iridescent'], 'Does this show Carnival Glass iridescent finish and pattern?', 1.3, NULL, now(), now()),
  (gen_random_uuid()::text, 'Occupied Japan Mark', 'Collectibles', ARRAY['occupied', 'japan', 'mark'], 'Is this marked "Occupied Japan" (1945-1952)?', 1.4, NULL, now(), now()),
  (gen_random_uuid()::text, 'Occupied Germany Mark', 'Collectibles', ARRAY['occupied', 'germany', 'mark'], 'Is this marked "Occupied Germany" (1945-1948)?', 1.3, NULL, now(), now()),
  (gen_random_uuid()::text, 'Steiff Teddy Bear Button', 'Collectibles', ARRAY['steiff', 'button', 'ear', 'teddy'], 'Does this teddy bear have Steiff button in ear?', 1.6, 'Steiff Teddy Bears', now(), now()),
  (gen_random_uuid()::text, 'Lionel Train Early Edition', 'Collectibles', ARRAY['lionel', 'train', 'vintage', 'prewar'], 'Is this Lionel Train from 1940s or earlier?', 1.4, 'Lionel Trains', now(), now()),
  (gen_random_uuid()::text, 'Vintage Levi 501 Button Fly', 'Clothing', ARRAY['levi', '501', 'button', 'vintage'], 'Is this Levi 501 with button fly (pre-1960s)?', 1.5, 'Vintage Levi''s 501', now(), now()),
  (gen_random_uuid()::text, 'Coach Leather Vintage', 'Accessories', ARRAY['coach', 'leather', 'vintage', 'tag'], 'Is this Coach bag with vintage leather and early hang tag?', 1.3, 'Coach Vintage', now(), now());
