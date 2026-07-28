-- Booth invite observability (2026-07-28).
--
-- Purely additive: two nullable/defaulted columns on "VendorBooth". No column is
-- dropped or retyped, no existing row changes meaning, and nothing outside the booth
-- invite path reads or writes them.
--
-- Backfill: deliberately none. Every pre-existing booth has inviteSentAt = NULL and
-- inviteSentCount = 0, which is the truth -- no booth invite email has ever been sent
-- by this codebase. Do NOT seed these from createdAt.
--
-- MUST be applied BEFORE (or with) the deploy that ships
-- services/vendorBoothInviteEmailService.ts: listVendorBooths selects inviteSentAt and
-- inviteSentCount, so the organizer Vendor Booths page 500s against a DB without them.

ALTER TABLE "VendorBooth" ADD COLUMN IF NOT EXISTS "inviteSentAt" TIMESTAMP(3);

ALTER TABLE "VendorBooth" ADD COLUMN IF NOT EXISTS "inviteSentCount" INTEGER NOT NULL DEFAULT 0;
