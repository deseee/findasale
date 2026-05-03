-- P1 fix: Add unique constraint to Organizer.googlePlaceId
-- foursquareVenueId and hereBusinessId already have @unique

-- Step 1: Deduplicate any existing rows with the same googlePlaceId
-- Keep the row with the lowest id for each duplicate group
DELETE FROM "Organizer" o1
USING "Organizer" o2
WHERE o1."googlePlaceId" IS NOT NULL
  AND o1."googlePlaceId" = o2."googlePlaceId"
  AND o1.id > o2.id;

-- Step 2: Drop the old non-unique index (now replaced by the unique constraint)
DROP INDEX IF EXISTS "Organizer_googlePlaceId_idx";

-- Step 3: Add unique constraint (partial — allows multiple NULLs per Postgres convention)
CREATE UNIQUE INDEX IF NOT EXISTS "Organizer_googlePlaceId_key"
  ON "Organizer"("googlePlaceId")
  WHERE "googlePlaceId" IS NOT NULL;
