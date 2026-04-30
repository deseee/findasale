-- Add OrganizerBroadcast table for feature #356
CREATE TABLE "OrganizerBroadcast" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "OrganizerBroadcast_pkey" PRIMARY KEY ("id")
);

-- Add foreign key constraint
ALTER TABLE "OrganizerBroadcast" ADD CONSTRAINT "OrganizerBroadcast_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create index for fast lookups by organizer
CREATE INDEX "OrganizerBroadcast_organizerId_idx" ON "OrganizerBroadcast"("organizerId");
