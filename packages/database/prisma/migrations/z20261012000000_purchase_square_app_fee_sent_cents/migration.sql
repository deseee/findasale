-- Platform bears Square card processing cost: record the app fee actually sent to Square (nullable, no backfill).
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "squareAppFeeSentCents" INTEGER;
