-- Remove shopperCredits field from User model (Batch 17 tech debt cleanup)
ALTER TABLE "User" DROP COLUMN IF EXISTS "shopperCredits";
