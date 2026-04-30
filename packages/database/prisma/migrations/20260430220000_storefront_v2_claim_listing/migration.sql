-- Feature #361: Claim-This-Listing — allow unclaimed organizer profiles to be claimed
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "isClaimed" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "isUnmanagedListing" BOOLEAN NOT NULL DEFAULT false;

-- ClaimRequest model — tracks claim requests for unclaimed listings
CREATE TABLE IF NOT EXISTS "ClaimRequest" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "claimantEmail" TEXT NOT NULL,
    "claimantName" TEXT NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    CONSTRAINT "ClaimRequest_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ClaimRequest" ADD CONSTRAINT "ClaimRequest_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "ClaimRequest_organizerId_idx" ON "ClaimRequest"("organizerId");
CREATE INDEX IF NOT EXISTS "ClaimRequest_status_idx" ON "ClaimRequest"("status");
