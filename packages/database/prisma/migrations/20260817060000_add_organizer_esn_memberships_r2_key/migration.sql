-- Restore schema/DB parity for the 2026-08-09 "DB space pass": two Organizer R2-offload
-- pointer columns were added directly to production (`prisma db push` / manual ALTER)
-- with no migration file ever created for either. A fresh database (CI, disaster
-- recovery) has no way to create these columns, silently breaking any query that
-- projects them. IF NOT EXISTS makes both safe to apply against production (columns
-- already present) or a from-scratch database (columns missing).
--   - esnMembershipsR2Key  (schema.prisma:466 -- String?, R2 key when esnMemberships offloaded)
--   - sourcesJsonR2Key     (schema.prisma:501 -- String?, R2 key when sourcesJson offloaded)
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "esnMembershipsR2Key" TEXT;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "sourcesJsonR2Key" TEXT;
