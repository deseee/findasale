-- Update all STAFF role values to MEMBER
UPDATE "WorkspaceMember" SET "role" = 'MEMBER' WHERE "role" = 'STAFF';

-- For WorkspacePermission: delete STAFF rows where a MEMBER row already exists
-- (same workspace + same action), then convert remaining STAFF → MEMBER
DELETE FROM "WorkspacePermission" wp1
WHERE wp1."role" = 'STAFF'
  AND EXISTS (
    SELECT 1 FROM "WorkspacePermission" wp2
    WHERE wp2."workspaceId" = wp1."workspaceId"
      AND wp2."action" = wp1."action"
      AND wp2."role" = 'MEMBER'
  );
UPDATE "WorkspacePermission" SET "role" = 'MEMBER' WHERE "role" = 'STAFF';

UPDATE "StaffMember" SET "role" = 'MEMBER' WHERE "role" = 'STAFF';

-- Remove STAFF from WorkspaceRole enum
ALTER TYPE "WorkspaceRole" RENAME TO "WorkspaceRole_old";
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'VIEWER');

ALTER TABLE "WorkspaceMember" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "WorkspaceMember" ALTER COLUMN "role" TYPE "WorkspaceRole" USING "role"::text::"WorkspaceRole";
ALTER TABLE "WorkspaceMember" ALTER COLUMN "role" SET DEFAULT 'MEMBER'::"WorkspaceRole";

ALTER TABLE "WorkspacePermission" ALTER COLUMN "role" TYPE "WorkspaceRole" USING "role"::text::"WorkspaceRole";

DROP TYPE "WorkspaceRole_old";

-- Update default role on StaffMember before rename
ALTER TABLE "StaffMember" ALTER COLUMN "role" SET DEFAULT 'MEMBER';

-- Rename tables
ALTER TABLE "StaffMember" RENAME TO "TeamMember";
ALTER TABLE "StaffAvailability" RENAME TO "TeamMemberAvailability";
ALTER TABLE "StaffPerformance" RENAME TO "TeamMemberPerformance";

-- Rename foreign key columns
ALTER TABLE "TeamMemberAvailability" RENAME COLUMN "staffMemberId" TO "teamMemberId";
ALTER TABLE "TeamMemberPerformance" RENAME COLUMN "staffMemberId" TO "teamMemberId";
ALTER TABLE "WorkspaceLeaderboardEntry" RENAME COLUMN "staffMemberId" TO "teamMemberId";
