-- Feature: Graceful tier degradation — grace period fields

-- Organizer: grace period tracking
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "graceEndAt" TIMESTAMP(3);
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "graceTierBefore" TEXT;
ALTER TABLE "Organizer" ADD COLUMN IF NOT EXISTS "graceNotificationsCount" INTEGER NOT NULL DEFAULT 0;

-- Item: grace lock status
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "graceLockedAt" TIMESTAMP(3);
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "graceLockedReason" TEXT;

-- WorkspaceMember: team member grace period
ALTER TABLE "WorkspaceMember" ADD COLUMN IF NOT EXISTS "graceRemovedAt" TIMESTAMP(3);
ALTER TABLE "WorkspaceMember" ADD COLUMN IF NOT EXISTS "memberGraceEndAt" TIMESTAMP(3);
ALTER TABLE "WorkspaceMember" ADD COLUMN IF NOT EXISTS "accessRestored" BOOLEAN NOT NULL DEFAULT false;
