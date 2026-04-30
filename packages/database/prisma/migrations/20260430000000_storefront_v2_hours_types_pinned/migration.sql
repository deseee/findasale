-- Feature #354: OrganizerHours — business hours and appointment settings
-- Feature #355: Organizer Types Multi-Select
-- Feature #359: Sale Pinned/Featured Flag

-- CreateTable OrganizerHours
CREATE TABLE "OrganizerHours" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "openTime" TEXT NOT NULL,
    "closeTime" TEXT NOT NULL,

    CONSTRAINT "OrganizerHours_pkey" PRIMARY KEY ("id")
);

-- CreateIndex for OrganizerHours unique constraint
CREATE UNIQUE INDEX "OrganizerHours_organizerId_dayOfWeek_key" ON "OrganizerHours"("organizerId", "dayOfWeek");

-- AddForeignKey for OrganizerHours
ALTER TABLE "OrganizerHours" ADD CONSTRAINT "OrganizerHours_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable Organizer — add timezone, byAppointment, organizerTypes
ALTER TABLE "Organizer" ADD COLUMN "timezone" TEXT;
ALTER TABLE "Organizer" ADD COLUMN "byAppointment" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organizer" ADD COLUMN "organizerTypes" TEXT[] NOT NULL DEFAULT '{}';

-- AlterTable Sale — add isPinned
ALTER TABLE "Sale" ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false;
