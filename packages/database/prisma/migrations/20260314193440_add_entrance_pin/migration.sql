-- Feature 35: Front Door Locator
-- Adds optional entrance/parking pin fields to the Sale table.
-- All fields are optional — existing sales are unaffected.

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "entranceLat" DOUBLE PRECISION,
ADD COLUMN     "entranceLng" DOUBLE PRECISION,
ADD COLUMN     "entranceNote" VARCHAR(150);
