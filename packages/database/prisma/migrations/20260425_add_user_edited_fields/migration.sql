-- Task #336: Add userEditedFields array to Item for D-006 organizer-intent race condition fix
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "userEditedFields" TEXT[] NOT NULL DEFAULT '{}';

-- Task #3: Add estate planning pre-wire fields to Organizer (already exist in schema as of S###)
-- Note: executorUserId and estateId already present in Organizer model; this migration ensures they exist in production
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "executorUserId" TEXT;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "estateId" TEXT;
