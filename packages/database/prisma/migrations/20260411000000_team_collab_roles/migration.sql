-- ALTER TYPE "WorkspaceRole" to add MANAGER, STAFF, VIEWER
ALTER TYPE "WorkspaceRole" ADD VALUE IF NOT EXISTS 'MANAGER';
ALTER TYPE "WorkspaceRole" ADD VALUE IF NOT EXISTS 'STAFF';
ALTER TYPE "WorkspaceRole" ADD VALUE IF NOT EXISTS 'VIEWER';

-- Add updatedAt to OrganizerWorkspace
ALTER TABLE "OrganizerWorkspace" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Create WorkspacePermission table
CREATE TABLE "WorkspacePermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    "action" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkspacePermission_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "OrganizerWorkspace" ("id") ON DELETE CASCADE
);

-- Create unique constraint on WorkspacePermission
CREATE UNIQUE INDEX "WorkspacePermission_workspaceId_role_action_key" ON "WorkspacePermission"("workspaceId", "role", "action");

-- Create index for workspace and role
CREATE INDEX "WorkspacePermission_workspaceId_role_idx" ON "WorkspacePermission"("workspaceId", "role");

-- Create WorkspaceRoleTemplate table
CREATE TABLE "WorkspaceRoleTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL UNIQUE,
    "permissions" TEXT[] NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- Create index on template name
CREATE INDEX "WorkspaceRoleTemplate_name_idx" ON "WorkspaceRoleTemplate"("name");
