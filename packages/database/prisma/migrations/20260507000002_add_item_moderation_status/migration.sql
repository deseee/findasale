-- Add moderationStatus to Item table (NSFW detection)
-- Schema already has this field but migration was never created
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "moderationStatus" TEXT NOT NULL DEFAULT 'APPROVED';
CREATE INDEX IF NOT EXISTS "Item_moderationStatus_idx" ON "Item"("moderationStatus");
