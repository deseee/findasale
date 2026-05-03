-- Restore models wiped during S624/S625 multi-schema sync
-- OrganizerHours and OrganizerBroadcast tables already exist from prior migrations
-- MetroTopFinds table exists but may be missing createdAt column
-- All statements use IF NOT EXISTS / IF NOT EXISTS for safety

-- Ensure OrganizerHours table exists (created by 20260430000000, should be present)
CREATE TABLE IF NOT EXISTS "OrganizerHours" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "openTime" TEXT NOT NULL,
    "closeTime" TEXT NOT NULL,
    CONSTRAINT "OrganizerHours_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OrganizerHours_organizerId_fkey'
  ) THEN
    ALTER TABLE "OrganizerHours" ADD CONSTRAINT "OrganizerHours_organizerId_fkey"
      FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "OrganizerHours_organizerId_dayOfWeek_key"
  ON "OrganizerHours"("organizerId", "dayOfWeek");

-- Ensure OrganizerBroadcast table exists (created by 20260430200000, should be present)
CREATE TABLE IF NOT EXISTS "OrganizerBroadcast" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "OrganizerBroadcast_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OrganizerBroadcast_organizerId_fkey'
  ) THEN
    ALTER TABLE "OrganizerBroadcast" ADD CONSTRAINT "OrganizerBroadcast_organizerId_fkey"
      FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "OrganizerBroadcast_organizerId_idx"
  ON "OrganizerBroadcast"("organizerId");

-- MetroTopFinds: add missing createdAt column (table exists but column was lost)
ALTER TABLE "MetroTopFinds" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "MetroTopFinds" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
