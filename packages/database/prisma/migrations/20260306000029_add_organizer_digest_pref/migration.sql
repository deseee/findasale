-- AddColumn: emailWeeklyOrganizerDigest to User model
-- Organizers can toggle their weekly analytics email preference

ALTER TABLE "User" ADD COLUMN "emailWeeklyOrganizerDigest" BOOLEAN NOT NULL DEFAULT true;
