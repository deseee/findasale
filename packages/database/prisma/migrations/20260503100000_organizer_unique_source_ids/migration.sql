-- P1 fix: Add unique constraint to Organizer.googlePlaceId
-- foursquareVenueId and hereBusinessId already have @unique

-- Step 1: Nullify googlePlaceId on duplicate organizers (keep the lowest id per googlePlaceId).
-- Cannot DELETE because Sale_organizerId_fkey is RESTRICT — rows with linked sales cannot be removed.
-- Nullifying instead: the unique index below allows multiple NULLs, so this is safe.
-- The "worse" duplicate (higher id = created later) loses its googlePlaceId;
-- the next scraper run will find the keeper via the real placeId and add to it.
UPDATE "Organizer" o1
SET "googlePlaceId" = NULL
FROM "Organizer" o2
WHERE o1."googlePlaceId" IS NOT NULL
  AND o1."googlePlaceId" = o2."googlePlaceId"
  AND o1.id > o2.id;

-- Step 2: Drop the old non-unique index (replaced by the unique constraint below)
DROP INDEX IF EXISTS "Organizer_googlePlaceId_idx";

-- Step 3: Add unique constraint (partial — allows multiple NULLs per Postgres convention)
CREATE UNIQUE INDEX IF NOT EXISTS "Organizer_googlePlaceId_key"
  ON "Organizer"("googlePlaceId")
  WHERE "googlePlaceId" IS NOT NULL;
