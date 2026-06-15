-- Feature #358: Follower Count Visibility Toggle
-- Adds showFollowerCount to Organizer — default true (count visible by default)
ALTER TABLE "Organizer" ADD COLUMN "showFollowerCount" BOOLEAN NOT NULL DEFAULT true;
