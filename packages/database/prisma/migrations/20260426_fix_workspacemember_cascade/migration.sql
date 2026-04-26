-- Fix orphaned WorkspaceMember rows and enforce CASCADE delete
-- Root cause: WorkspaceMember rows whose OrganizerWorkspace was deleted without cascade

-- Step 1: Delete orphaned WorkspaceMember rows
DELETE FROM "WorkspaceMember"
WHERE id IN (
  SELECT wm.id FROM "WorkspaceMember" wm
  LEFT JOIN "OrganizerWorkspace" ow ON ow.id = wm."workspaceId"
  WHERE ow.id IS NULL
);

-- Step 2: Drop the existing FK constraint (no cascade)
ALTER TABLE "WorkspaceMember"
DROP CONSTRAINT IF EXISTS "WorkspaceMember_workspaceId_fkey";

-- Step 3: Re-add with ON DELETE CASCADE so future workspace deletions clean up members
ALTER TABLE "WorkspaceMember"
ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey"
FOREIGN KEY ("workspaceId")
REFERENCES "OrganizerWorkspace"(id)
ON DELETE CASCADE;
