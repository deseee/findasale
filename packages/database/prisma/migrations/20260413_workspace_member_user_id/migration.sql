-- Make organizerId nullable
ALTER TABLE "WorkspaceMember" ALTER COLUMN "organizerId" DROP NOT NULL;

-- Add userId column
ALTER TABLE "WorkspaceMember" ADD COLUMN "userId" TEXT;

-- Add FK constraint for userId
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add unique index for workspaceId + userId path
CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key"
  ON "WorkspaceMember"("workspaceId", "userId");

-- Add index for userId lookups
CREATE INDEX "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");
