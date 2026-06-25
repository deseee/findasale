-- AddColumn EmailSuppression bounce classification fields
-- Applied via raw DDL in S1020. This migration file created retroactively for Prisma tracking.
ALTER TABLE "EmailSuppression" ADD COLUMN IF NOT EXISTS "bounceCategory" TEXT;
ALTER TABLE "EmailSuppression" ADD COLUMN IF NOT EXISTS "bounceStatusCode" TEXT;
ALTER TABLE "EmailSuppression" ADD COLUMN IF NOT EXISTS "diagnosticCode" TEXT;
ALTER TABLE "EmailSuppression" ADD COLUMN IF NOT EXISTS "retryAfter" TIMESTAMP(3);
ALTER TABLE "EmailSuppression" ADD COLUMN IF NOT EXISTS "classifiedAt" TIMESTAMP(3);
