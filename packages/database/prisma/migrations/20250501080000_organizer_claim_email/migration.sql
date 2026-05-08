-- ADR-073 Phase 2: Organizer Claim Email Pipeline — 3-touch sequence table

CREATE TABLE "OrganizerClaimEmail" (
  "id" TEXT NOT NULL,
  "organizerId" TEXT NOT NULL,
  "touchNumber" INTEGER NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" TEXT NOT NULL DEFAULT 'sent',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OrganizerClaimEmail_pkey" PRIMARY KEY ("id")
);

-- Create indexes for query performance
CREATE INDEX "OrganizerClaimEmail_organizerId_idx" ON "OrganizerClaimEmail"("organizerId");
CREATE INDEX "OrganizerClaimEmail_sentAt_idx" ON "OrganizerClaimEmail"("sentAt");
CREATE INDEX "OrganizerClaimEmail_touchNumber_idx" ON "OrganizerClaimEmail"("touchNumber");

-- Create unique constraint (one email per touch per organizer)
CREATE UNIQUE INDEX "OrganizerClaimEmail_organizerId_touchNumber_key" ON "OrganizerClaimEmail"("organizerId", "touchNumber");

-- Add foreign key to Organizer with cascade delete
ALTER TABLE "OrganizerClaimEmail" ADD CONSTRAINT "OrganizerClaimEmail_organizerId_fkey"
  FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
