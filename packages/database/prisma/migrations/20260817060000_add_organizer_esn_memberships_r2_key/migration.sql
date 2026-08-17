-- Restore schema/DB parity: esnMembershipsR2Key (schema.prisma:466) was added directly
-- to production via `prisma db push` / manual ALTER during the 2026-08-09 DB space pass,
-- with no migration file ever created for it. A fresh database (CI, disaster recovery)
-- has no way to create this column, silently breaking any query that projects it.
-- IF NOT EXISTS makes this safe to apply against production (column already present)
-- or a from-scratch database (column missing).
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "esnMembershipsR2Key" TEXT;
