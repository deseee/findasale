-- ADR-132 (2026-09-23): Discogs release matching, persistence and correction of wrong listings.
-- claude_docs/architecture/ADR-132-discogs-release-matching-and-correction.md, section 4.
--
-- WHY: Discogs listings were pushed against the WRONG catalog release (title-only fuzzy
-- matching, nothing persisted, re-searched at push time). These columns store the decided
-- release, the match status/candidates shown to the organizer, the structured record identity
-- used to match, and the release the live listing actually uses.
--
-- SAFETY: additive only. Seven nullable columns + one index, no defaults, no backfill, no data
-- movement. Every existing row reads NULL = "not matched yet"; the matcher fills rows lazily on
-- view/push and via the dry-run-by-default rematch sweep (POST /api/discogs/match/sweep).
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS "Item_discogsMatchStatus_idx";
--   ALTER TABLE "Item" DROP COLUMN "recordIdentity", DROP COLUMN "discogsReleaseId",
--     DROP COLUMN "discogsMatchStatus", DROP COLUMN "discogsCandidates", DROP COLUMN "discogsMatchedAt",
--     DROP COLUMN "discogsMatchInputHash", DROP COLUMN "discogsListingReleaseId";

-- AlterTable
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "recordIdentity" JSONB;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "discogsReleaseId" INTEGER;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "discogsMatchStatus" TEXT;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "discogsCandidates" JSONB;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "discogsMatchedAt" TIMESTAMP(3);
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "discogsMatchInputHash" TEXT;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "discogsListingReleaseId" INTEGER;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Item_discogsMatchStatus_idx" ON "Item"("discogsMatchStatus");
