-- SaleSubscriber guest email double opt-in (2026-09-30)
--
-- WHY: an anonymous visitor can now subscribe an email address to a sale's reminders. The row is PENDING until the
-- address owner clicks the link in a confirmation email (single-use token, stored only as its SHA-256, 48 hour expiry).
-- Reminder emails are sent to a guest row only when emailConfirmedAt is set. Every email carries an opt-out link.
--
-- SAFETY: additive only. Three nullable columns and one unique index on the token hash (NULLs do not collide). No
-- existing row is rewritten; existing account-linked rows are unaffected (their reminders go to the account email and
-- never read these columns). Fully idempotent. Apply manually, BEFORE deploying the matching backend build.
--
-- Down migration (safe at any time once the backend no longer reads the columns):
--   DROP INDEX IF EXISTS "SaleSubscriber_emailConfirmTokenHash_key";
--   ALTER TABLE "SaleSubscriber" DROP COLUMN IF EXISTS "emailConfirmTokenHash",
--     DROP COLUMN IF EXISTS "emailConfirmExpiresAt", DROP COLUMN IF EXISTS "emailConfirmedAt";

ALTER TABLE "SaleSubscriber" ADD COLUMN IF NOT EXISTS "emailConfirmTokenHash" TEXT;
ALTER TABLE "SaleSubscriber" ADD COLUMN IF NOT EXISTS "emailConfirmExpiresAt" TIMESTAMP(3);
ALTER TABLE "SaleSubscriber" ADD COLUMN IF NOT EXISTS "emailConfirmedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "SaleSubscriber_emailConfirmTokenHash_key" ON "SaleSubscriber"("emailConfirmTokenHash");
