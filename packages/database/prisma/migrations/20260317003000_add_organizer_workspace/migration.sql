-- CreateEnum: WorkspaceRole
DROP TABLE IF EXISTS "WorkspaceMember";
DROP TABLE IF EXISTS "OrganizerWorkspace";
DROP TYPE IF EXISTS "WorkspaceRole";
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateTable: OrganizerWorkspace
CREATE TABLE "OrganizerWorkspace" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "ownerId" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrganizerWorkspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Organizer"("id") ON DELETE CASCADE
);

-- CreateTable: WorkspaceMember
CREATE TABLE "WorkspaceMember" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "organizerId" TEXT NOT NULL,
  "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
  "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3),
  CONSTRAINT "WorkspaceMember_workspaceId_organizerId_key" UNIQUE("workspaceId", "organizerId"),
  CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "OrganizerWorkspace"("id") ON DELETE CASCADE,
  CONSTRAINT "WorkspaceMember_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WorkspaceMember_workspaceId_idx" ON "WorkspaceMember"("workspaceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WorkspaceMember_organizerId_idx" ON "WorkspaceMember"("organizerId");
