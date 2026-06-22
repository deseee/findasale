-- Records the EmailSuppression bounce-classification columns that were applied to the
-- live Railway DB out-of-band (raw DDL, no migration). These columns + index ALREADY
-- EXIST in production. This file exists ONLY so the migration folder set matches the
-- live DB and the shadow-DB replay (prisma migrate dev) reproduces the real schema.
--
-- DO NOT run this SQL against production. It is intended to be registered with:
--   prisma migrate resolve --applied 20260622000000_add_email_suppression_classification
-- which records the migration as applied WITHOUT executing the DDL.
--
-- The IF NOT EXISTS guards make the statements safe if they are ever replayed against a
-- DB that already has the columns (e.g. the shadow DB will run them on a fresh table, and
-- production will never run them because the migration is marked applied via resolve).
--
-- Column types/nullability verified against information_schema.columns on the live DB
-- (maglev.proxy.rlwy.net:13949/railway):
--   bounceCategory   text       NULL
--   bounceStatusCode text       NULL
--   diagnosticCode   text       NULL
--   retryAfter       timestamp  NULL
--   classifiedAt     timestamp  NULL
-- Index verified live: EmailSuppression_retryAfter_idx (btree on "retryAfter").

-- AlterTable
ALTER TABLE "EmailSuppression" ADD COLUMN IF NOT EXISTS "bounceCategory" TEXT;
ALTER TABLE "EmailSuppression" ADD COLUMN IF NOT EXISTS "bounceStatusCode" TEXT;
ALTER TABLE "EmailSuppression" ADD COLUMN IF NOT EXISTS "diagnosticCode" TEXT;
ALTER TABLE "EmailSuppression" ADD COLUMN IF NOT EXISTS "retryAfter" TIMESTAMP(3);
ALTER TABLE "EmailSuppression" ADD COLUMN IF NOT EXISTS "classifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmailSuppression_retryAfter_idx" ON "EmailSuppression"("retryAfter");
