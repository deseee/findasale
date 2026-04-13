-- Add missing fields to WorkspaceSettings (name, description, brandRules, templateUsed, maxMembers)
ALTER TABLE "WorkspaceSettings" ADD COLUMN "name" TEXT;
ALTER TABLE "WorkspaceSettings" ADD COLUMN "description" TEXT;
ALTER TABLE "WorkspaceSettings" ADD COLUMN "brandRules" TEXT;
ALTER TABLE "WorkspaceSettings" ADD COLUMN "templateUsed" TEXT;
ALTER TABLE "WorkspaceSettings" ADD COLUMN "maxMembers" INTEGER NOT NULL DEFAULT 5;
