-- CreateTable: OrganizerClaimEmail — ADR-073 Phase 2: 3-touch claim email pipeline for unmanaged organizers
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

-- AddForeignKey
ALTER TABLE "OrganizerClaimEmail" ADD CONSTRAINT "OrganizerClaimEmail_organizerId_fkey"
  FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "OrganizerClaimEmail_organizerId_idx" ON "OrganizerClaimEmail"("organizerId");

-- CreateIndex
CREATE INDEX "OrganizerClaimEmail_sentAt_idx" ON "OrganizerClaimEmail"("sentAt");

-- CreateIndex
CREATE INDEX "OrganizerClaimEmail_touchNumber_idx" ON "OrganizerClaimEmail"("touchNumber");

-- CreateUniqueIndex: one email per touch per organizer
CREATE UNIQUE INDEX "OrganizerClaimEmail_organizerId_touchNumber_key" ON "OrganizerClaimEmail"("organizerId", "touchNumber");
