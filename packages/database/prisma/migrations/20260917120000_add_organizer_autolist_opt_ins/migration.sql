-- ADR-DRAFT approve-to-autolist-fanout (2026-09-16/17, Architect Handoff section A / Migration Plan).
-- 8 additive Boolean opt-in columns on "Organizer", all NOT NULL DEFAULT false. Additive-only,
-- no backfill, no FK, no index (read per-organizer-row only, never queried in bulk).
--
-- Rollback (down migration, per handoff): reverse order --
--   ALTER TABLE "Organizer" DROP COLUMN "reverbAutoListEnabled";
--   ALTER TABLE "Organizer" DROP COLUMN "discogsAutoListEnabled";
--   ALTER TABLE "Organizer" DROP COLUMN "mercariAutoListEnabled";
--   ALTER TABLE "Organizer" DROP COLUMN "poshmarkAutoListEnabled";
--   ALTER TABLE "Organizer" DROP COLUMN "grailedAutoListEnabled";
--   ALTER TABLE "Organizer" DROP COLUMN "gumtreeAuAutoListEnabled";
--   ALTER TABLE "Organizer" DROP COLUMN "facebookAutoListEnabled";
--   ALTER TABLE "Organizer" DROP COLUMN "craigslistAutoListEnabled";
-- Safe to roll back at any time before or after this feature's code deploys -- the 8 columns
-- are inert until the dispatcher/endpoint code that reads them also ships.

ALTER TABLE "Organizer" ADD COLUMN "craigslistAutoListEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organizer" ADD COLUMN "facebookAutoListEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organizer" ADD COLUMN "gumtreeAuAutoListEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organizer" ADD COLUMN "grailedAutoListEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organizer" ADD COLUMN "poshmarkAutoListEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organizer" ADD COLUMN "mercariAutoListEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organizer" ADD COLUMN "discogsAutoListEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organizer" ADD COLUMN "reverbAutoListEnabled" BOOLEAN NOT NULL DEFAULT false;
