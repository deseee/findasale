-- Category-vocabulary-drift fix (2026-08-25, P0, Patrick-flagged urgent).
--
-- Root cause: CategoryDepreciation, BrandException, and SleeperPattern (seeded in
-- migrations/20260425_add_pricing_engine/migration.sql) were seeded with an OLD
-- category vocabulary (Furniture, Electronics, Tools, Appliances, Clothing, Vinyl,
-- Glassware, Cast Iron, Cookware, Pottery, Accessories) that predates the eBay L1
-- category taxonomy (packages/backend/src/config/ebayCategories.ts's
-- EBAY_L1_CATEGORIES, the real single source of truth for item.category since the
-- AI tagging pipeline and eBay category resolver both use it). The two vocabularies
-- were never reconciled. Confirmed live in production: only 2/12 CategoryDepreciation
-- rows and 5/30 BrandException rows could ever exact-match a real item's category
-- (only 'Collectibles' and 'Art' happen to also be real L1 names). This silently
-- broke brand-premium detection, depreciation curves, and sleeper-pattern detection
-- for the vast majority of real inventory. Paired with a code fix
-- (packages/backend/src/config/ebayCategories.ts's new extractL1() helper, wired
-- into depreciation.ts/signals.ts) that normalizes lookups going forward -- this
-- migration re-keys the existing seed data onto real L1 names so it actually
-- matches once normalization is live. Pure data UPDATE/DELETE -- no schema change.

-- ============================================================================
-- CategoryDepreciation: category has a UNIQUE constraint. Most old categories map
-- 1:1 onto a real L1 name. Three (Furniture, Appliances, Cast Iron) all
-- conceptually belong under 'Home & Garden' and would collide if all three tried
-- to become separate 'Home & Garden' rows -- so Furniture's row is renamed and
-- kept (its baseRetentionRate blended with Appliances': (0.85+0.70)/2 = 0.80), and
-- the Appliances/Cast Iron rows are deleted. KNOWN SIMPLIFICATION, flagged for
-- Patrick: this collapses three previously-distinct depreciation profiles into one
-- coarser 'Home & Garden' curve. If sub-category granularity within Home & Garden
-- turns out to matter (e.g. cast iron cookware genuinely holds value very
-- differently than a generic appliance), that needs a real design decision on how
-- to key depreciation curves more granularly than eBay L1 -- not silently redone
-- here.
-- ============================================================================

UPDATE "CategoryDepreciation" SET "category" = 'Consumer Electronics', "updatedAt" = now() WHERE "category" = 'Electronics';
UPDATE "CategoryDepreciation" SET "category" = 'Business & Industrial', "updatedAt" = now() WHERE "category" = 'Tools';
UPDATE "CategoryDepreciation" SET "category" = 'Clothing, Shoes & Accessories', "updatedAt" = now() WHERE "category" = 'Clothing';
UPDATE "CategoryDepreciation" SET "category" = 'Music', "updatedAt" = now() WHERE "category" = 'Vinyl';
UPDATE "CategoryDepreciation" SET "category" = 'Pottery & Glass', "updatedAt" = now() WHERE "category" = 'Glassware';
UPDATE "CategoryDepreciation" SET "category" = 'Jewelry & Watches', "updatedAt" = now() WHERE "category" = 'Jewelry';
UPDATE "CategoryDepreciation" SET "category" = 'Books & Magazines', "updatedAt" = now() WHERE "category" = 'Books';

-- Furniture/Appliances/Cast Iron merge (Home & Garden) -- rename Furniture, blend
-- its rate with Appliances', then delete the two rows that would otherwise collide.
UPDATE "CategoryDepreciation"
  SET "category" = 'Home & Garden',
      "baseRetentionRate" = 0.80,
      "notes" = COALESCE("notes" || ' ', '') || '[2026-08-25: merged with former Appliances/Cast Iron rows during eBay-L1 category remap -- see migration comment for rationale.]',
      "updatedAt" = now()
  WHERE "category" = 'Furniture';
DELETE FROM "CategoryDepreciation" WHERE "category" IN ('Appliances', 'Cast Iron');

-- 'Collectibles' and 'Art' are already real L1 names -- no change needed.

-- ============================================================================
-- BrandException: category is NOT unique (brand+category pair distinguishes rows),
-- so every remap below is a plain 1:1 UPDATE keyed on the stable "brand" column --
-- no merging or deletion needed here.
-- ============================================================================

UPDATE "BrandException" SET "category" = 'Home & Garden', "updatedAt" = now() WHERE "brand" IN ('Herman Miller', 'Eames', 'Knoll', 'Le Creuset', 'All-Clad', 'Vitamix', 'KitchenAid', 'Griswold', 'Wagner Ware', 'Lodge');
UPDATE "BrandException" SET "category" = 'Pottery & Glass', "updatedAt" = now() WHERE "brand" IN ('Pyrex', 'Fiestaware', 'Waterford', 'Fire-King Jadeite', 'Depression Glass', 'McCoy Pottery', 'Roseville Pottery');
UPDATE "BrandException" SET "category" = 'Clothing, Shoes & Accessories', "updatedAt" = now() WHERE "brand" IN ('Vintage Levi''s 501', 'Patagonia', 'Coach Vintage', 'Dooney & Bourke Vintage');
UPDATE "BrandException" SET "category" = 'Business & Industrial', "updatedAt" = now() WHERE "brand" IN ('DeWalt', 'Milwaukee', 'Snap-on');
UPDATE "BrandException" SET "category" = 'Jewelry & Watches', "updatedAt" = now() WHERE "brand" = 'Tiffany & Co';

-- Steiff Teddy Bears / Lionel Trains / Matchbox Vintage / Hot Wheels Vintage /
-- Barbie Vintage are already category='Collectibles' -- a real L1 name, no change.

-- ============================================================================
-- SleeperPattern: category is NOT unique either -- plain 1:1 UPDATE per row, keyed
-- on the stable "patternName" column.
-- ============================================================================

UPDATE "SleeperPattern" SET "category" = 'Home & Garden', "updatedAt" = now() WHERE "patternName" IN ('Griswold Cast Iron Markings', 'Wagner Ware Vintage');
UPDATE "SleeperPattern" SET "category" = 'Pottery & Glass', "updatedAt" = now() WHERE "patternName" IN ('Pyrex Butterfly Pattern', 'Pyrex Gold Leaf Pattern', 'Pyrex Gooseberry Pattern', 'Pyrex Lucky in Love', 'Pyrex Balloons Pattern', 'Fiestaware Discontinued Color', 'Fire-King Jadeite Glass', 'Hull Pottery Mark', 'Roseville Pottery Mark', 'McCoy Pottery Mark', 'Depression Glass Pattern', 'Carnival Glass Pattern');
UPDATE "SleeperPattern" SET "category" = 'Clothing, Shoes & Accessories', "updatedAt" = now() WHERE "patternName" IN ('Vintage Levi 501 Button Fly', 'Coach Leather Vintage');

-- Occupied Japan Mark / Occupied Germany Mark / Steiff Teddy Bear Button / Lionel
-- Train Early Edition are already category='Collectibles' -- a real L1 name, no change.
