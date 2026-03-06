-- Add endingSoonNotified field to Sale model for tracking "Sale Ending Soon" notification status
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "endingSoonNotified" BOOLEAN NOT NULL DEFAULT false;
