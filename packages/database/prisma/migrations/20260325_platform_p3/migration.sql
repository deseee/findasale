-- Platform Safety Batch P3: Account Controls (#99-#102)

-- #99: Export Rate Limiting (1 per month per account)
ALTER TABLE "User" ADD COLUMN "lastExportAt" TIMESTAMP(3);

-- #102: Payment Method Deduplication
ALTER TABLE "User" ADD COLUMN "stripeCardFingerprint" TEXT;
