-- Add rankUpHistory to User model for Hall of Fame + seasonal tracking
ALTER TABLE "User" ADD COLUMN "rankUpHistory" jsonb NOT NULL DEFAULT '[]';
