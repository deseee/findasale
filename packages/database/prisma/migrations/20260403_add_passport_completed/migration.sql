-- Add passportCompleted field to User model (Feature #45: Collector Passport completion XP)
-- Tracks whether user has earned COLLECTOR_PASSPORT_COMPLETE (50 XP) achievement
ALTER TABLE "User" ADD COLUMN "passportCompleted" BOOLEAN NOT NULL DEFAULT false;
