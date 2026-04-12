-- Add staffMember relation to WorkspaceMember
ALTER TABLE "WorkspaceMember" ADD COLUMN "staffMemberId" TEXT;

-- Create StaffMember table
CREATE TABLE "StaffMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceMemberId" TEXT NOT NULL UNIQUE,
    "role" TEXT NOT NULL DEFAULT 'STAFF',
    "department" TEXT,
    "primaryPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StaffMember_workspaceMemberId_fkey" FOREIGN KEY ("workspaceMemberId") REFERENCES "WorkspaceMember" ("id") ON DELETE CASCADE
);

-- Create index on StaffMember
CREATE INDEX "StaffMember_workspaceMemberId_idx" ON "StaffMember"("workspaceMemberId");

-- Create StaffAvailability table
CREATE TABLE "StaffAvailability" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "staffMemberId" TEXT NOT NULL UNIQUE,
    "monStartTime" TEXT,
    "monEndTime" TEXT,
    "tueStartTime" TEXT,
    "tueEndTime" TEXT,
    "wedStartTime" TEXT,
    "wedEndTime" TEXT,
    "thuStartTime" TEXT,
    "thuEndTime" TEXT,
    "friStartTime" TEXT,
    "friEndTime" TEXT,
    "satStartTime" TEXT,
    "satEndTime" TEXT,
    "sunStartTime" TEXT,
    "sunEndTime" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StaffAvailability_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "StaffMember" ("id") ON DELETE CASCADE
);

-- Create index on StaffAvailability
CREATE INDEX "StaffAvailability_staffMemberId_idx" ON "StaffAvailability"("staffMemberId");

-- Create StaffPerformance table
CREATE TABLE "StaffPerformance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "staffMemberId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "itemsSold" INTEGER NOT NULL DEFAULT 0,
    "revenue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "avgItemPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "tasksCompleted" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StaffPerformance_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "StaffMember" ("id") ON DELETE CASCADE
);

-- Create unique constraint on StaffPerformance
CREATE UNIQUE INDEX "StaffPerformance_staffMemberId_period_key" ON "StaffPerformance"("staffMemberId", "period");

-- Create index for queries
CREATE INDEX "StaffPerformance_staffMemberId_period_idx" ON "StaffPerformance"("staffMemberId", "period");
