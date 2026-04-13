-- Add organizerCredits field to User
ALTER TABLE "User" ADD COLUMN "organizerCredits" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable OrganizerReferral
CREATE TABLE "OrganizerReferral" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "referrerId" TEXT NOT NULL,
  "refereeId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "creditAmount" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "creditedAt" TIMESTAMP(3),
  CONSTRAINT "OrganizerReferral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User" ("id") ON DELETE CASCADE,
  CONSTRAINT "OrganizerReferral_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "User" ("id") ON DELETE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizerReferral_refereeId_key" ON "OrganizerReferral"("refereeId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizerReferral_referrerId_refereeId_key" ON "OrganizerReferral"("referrerId", "refereeId");
