-- 2026-08-27 carding-incident circuit breaker (S-incident-2026-08-27).
-- These two columns were applied directly to the PRODUCTION Railway Postgres via raw DDL
-- (packages/database's documented "Option B -- DDL-only changes" pattern) on the same day
-- schema.prisma was edited to add them, WITHOUT ever creating this migration file. That gap
-- is the root cause of the second CI failure on this incident's fix commits: CI's fresh
-- Postgres runs `prisma migrate deploy` against ONLY the migration history in this directory,
-- so the CI test database never got these columns even though the generated Prisma client
-- (matching schema.prisma) expects them -- any query touching Sale.paymentsHeldAt /
-- paymentsHeldReason (stripeController.ts's assertSaleCanAcceptPayment gate, wired into
-- createPaymentIntent and createCartCheckoutSession) throws at runtime in CI's backend test
-- suite. This file is the missing migration, using the exact SQL already live in production --
-- IF NOT EXISTS makes it a safe no-op there while giving CI's fresh database the real columns.

ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "paymentsHeldAt" TIMESTAMP(3);
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "paymentsHeldReason" TEXT;
CREATE INDEX IF NOT EXISTS "Sale_paymentsHeldAt_idx" ON "Sale" ("paymentsHeldAt");
