-- Feature: Verified Organizer — automated verification sources (ADR-073)
ALTER TABLE "Organizer"
  ADD COLUMN IF NOT EXISTS "verificationSource" TEXT,
  ADD COLUMN IF NOT EXISTS "googlePlaceId" TEXT,
  ADD COLUMN IF NOT EXISTS "facebookPageId" TEXT,
  ADD COLUMN IF NOT EXISTS "yelpBusinessId" TEXT,
  ADD COLUMN IF NOT EXISTS "stripeIdentitySessionId" TEXT;
