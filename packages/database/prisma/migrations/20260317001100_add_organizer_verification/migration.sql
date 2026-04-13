-- Feature #16: Verified Organizer Badge
ALTER TABLE "Organizer" ADD COLUMN "verificationStatus" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "Organizer" ADD COLUMN "verificationNotes" TEXT;
ALTER TABLE "Organizer" ADD COLUMN "verifiedAt" TIMESTAMP(3);
