-- Consignor invite + existing-account link (2026-10-06).
--   "Consignor"."userId"            nullable FK to "User"(id), ON DELETE SET NULL. Set when the consignor's email matches
--                                   exactly one existing FindA.Sale account (case-insensitive). Informational only: the
--                                   consignor keeps using the portalToken link and never needs to sign in.
--   "Consignor"."inviteEmailSentAt" nullable timestamp of the last welcome-invite email the transactional rail accepted.
--   "Consignor"."squarePortalOAuthNonce" nullable SHA-256 of the single-use nonce for the consignor-portal Square connect
--                                   flow (replay protection). Never exposed by any API.
--
-- SAFETY: additive and idempotent. Three nullable columns, one index, one FK, guarded with IF NOT EXISTS / pg_constraint.
-- The backfill only links a consignor when its trimmed, lowercased email matches EXACTLY ONE non-deleted User. "User"."email"
-- is unique but case-sensitive, so two legacy rows that differ only by case would both match; those are skipped entirely
-- rather than guessed. Rows already linked are never touched.
-- Apply with prisma migrate deploy BEFORE deploying the matching backend build (the regenerated Prisma client selects
-- "Consignor"."userId" and "Consignor"."inviteEmailSentAt" on every default Consignor read).
--
-- ROLLBACK (loses only the account links and invite-sent timestamps, no other data):
--   ALTER TABLE "Consignor" DROP CONSTRAINT IF EXISTS "Consignor_userId_fkey";
--   DROP INDEX IF EXISTS "Consignor_userId_idx";
--   ALTER TABLE "Consignor" DROP COLUMN IF EXISTS "userId";
--   ALTER TABLE "Consignor" DROP COLUMN IF EXISTS "inviteEmailSentAt";
--   ALTER TABLE "Consignor" DROP COLUMN IF EXISTS "squarePortalOAuthNonce";

ALTER TABLE "Consignor" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "Consignor" ADD COLUMN IF NOT EXISTS "inviteEmailSentAt" TIMESTAMP(3);
ALTER TABLE "Consignor" ADD COLUMN IF NOT EXISTS "squarePortalOAuthNonce" TEXT;

CREATE INDEX IF NOT EXISTS "Consignor_userId_idx" ON "Consignor"("userId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Consignor_userId_fkey') THEN
    ALTER TABLE "Consignor" ADD CONSTRAINT "Consignor_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill: link only unambiguous matches (exactly one live account for the normalized email).
WITH matches AS (
  SELECT lower(btrim(u."email")) AS norm_email, min(u."id") AS user_id, count(*) AS n
  FROM "User" u
  WHERE u."deletedAt" IS NULL
  GROUP BY lower(btrim(u."email"))
)
UPDATE "Consignor" c
SET "userId" = m.user_id
FROM matches m
WHERE c."userId" IS NULL
  AND c."email" IS NOT NULL
  AND btrim(c."email") <> ''
  AND lower(btrim(c."email")) = m.norm_email
  AND m.n = 1;
