-- Create WorkspaceInvite table for magic link invites
CREATE TABLE "WorkspaceInvite" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "inviteEmail" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
    "inviteToken" TEXT NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkspaceInvite_pkey" PRIMARY KEY ("id")
);

-- Create indexes for fast lookups
CREATE UNIQUE INDEX "WorkspaceInvite_inviteToken_key" ON "WorkspaceInvite"("inviteToken");
CREATE INDEX "WorkspaceInvite_inviteToken_idx" ON "WorkspaceInvite"("inviteToken");
CREATE INDEX "WorkspaceInvite_inviteEmail_idx" ON "WorkspaceInvite"("inviteEmail");
CREATE INDEX "WorkspaceInvite_workspaceId_idx" ON "WorkspaceInvite"("workspaceId");

-- Add foreign key constraint
ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "OrganizerWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
