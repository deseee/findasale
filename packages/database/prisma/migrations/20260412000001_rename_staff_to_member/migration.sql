-- Update all STAFF role values to MEMBER
UPDATE "WorkspaceMember" SET "role" = 'MEMBER' WHERE "role" = 'STAFF';
UPDATE "StaffMember" SET "role" = 'MEMBER' WHERE "role" = 'STAFF';
UPDATE "WorkspacePermission" SET "role" = 'MEMBER' WHERE "role" = 'STAFF';

-- Remove STAFF from WorkspaceRole enum
-- Must drop defaults and convert ALL columns using the old enum before dropping it
ALTER TYPE "WorkspaceRole" RENAME TO "WorkspaceRole_old";
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'VIEWER');

-- WorkspaceMember.role
ALTER TABLE "WorkspaceMember" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "WorkspaceMember" ALTER COLUMN "role" TYPE "WorkspaceRole" USING "role"::text::"WorkspaceRole";
ALTER TABLE "WorkspaceMember" ALTER COLUMN "role" SET DEFAULT 'MEMBER'::"WorkspaceRole";

-- WorkspacePermission.role
ALTER TABLE "WorkspacePermission" ALTER COLUMN "role" TYPE "WorkspaceRole" USING "role"::text::"WorkspaceRole";

-- Now safe to drop old enum
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
