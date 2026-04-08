-- Phase 2a: Guild/Crew Creation

CREATE TABLE "Crew" (
  "id"            TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "slug"          TEXT NOT NULL,
  "description"   VARCHAR(500),
  "founderUserId" TEXT NOT NULL,
  "isPublic"      BOOLEAN NOT NULL DEFAULT true,
  "memberCount"   INTEGER NOT NULL DEFAULT 1,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Crew_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CrewMember" (
  "id"       TEXT NOT NULL,
  "crewId"   TEXT NOT NULL,
  "userId"   TEXT NOT NULL,
  "role"     TEXT NOT NULL DEFAULT 'MEMBER',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrewMember_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
CREATE UNIQUE INDEX "Crew_name_key" ON "Crew"("name");
CREATE UNIQUE INDEX "Crew_slug_key" ON "Crew"("slug");
CREATE UNIQUE INDEX "CrewMember_crewId_userId_key" ON "CrewMember"("crewId", "userId");

-- Indexes
CREATE INDEX "Crew_isPublic_idx" ON "Crew"("isPublic");
CREATE INDEX "Crew_createdAt_idx" ON "Crew"("createdAt");
CREATE INDEX "CrewMember_crewId_idx" ON "CrewMember"("crewId");
CREATE INDEX "CrewMember_userId_idx" ON "CrewMember"("userId");

-- Foreign keys
ALTER TABLE "Crew" ADD CONSTRAINT "Crew_founderUserId_fkey"
  FOREIGN KEY ("founderUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrewMember" ADD CONSTRAINT "CrewMember_crewId_fkey"
  FOREIGN KEY ("crewId") REFERENCES "Crew"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrewMember" ADD CONSTRAINT "CrewMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add crewId to MissingListingBounty
ALTER TABLE "MissingListingBounty" ADD COLUMN "crewId" TEXT;
ALTER TABLE "MissingListingBounty" ADD CONSTRAINT "MissingListingBounty_crewId_fkey"
  FOREIGN KEY ("crewId") REFERENCES "Crew"("id") ON DELETE SET NULL ON UPDATE CASCADE;
