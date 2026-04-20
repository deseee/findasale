-- Remove deprecated collectorTitle field from User
ALTER TABLE "User" DROP COLUMN IF EXISTS "collectorTitle";
