-- Add watermark removal feature (TEAMS tier only)
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "removeWatermarkEnabled" BOOLEAN NOT NULL DEFAULT false;
