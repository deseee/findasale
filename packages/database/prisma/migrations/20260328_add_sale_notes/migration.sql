-- Feature #84: Day-of Approach Notes
-- Adds a notes column to Sale for organizers to share day-of info with saved-sale shoppers
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "notes" TEXT;
