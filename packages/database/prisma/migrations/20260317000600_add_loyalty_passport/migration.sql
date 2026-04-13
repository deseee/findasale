-- Add early access embargo to Item
ALTER TABLE "Item" ADD COLUMN "earlyAccessUntil" TIMESTAMP(3);

-- Create ShopperStamp table
CREATE TABLE "ShopperStamp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShopperStamp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE
);

-- Create StampMilestone table
CREATE TABLE "StampMilestone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "milestone" INTEGER NOT NULL,
    "badgeType" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StampMilestone_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE
);

-- Create unique indexes
CREATE UNIQUE INDEX "ShopperStamp_userId_type_key" ON "ShopperStamp"("userId", "type");
CREATE INDEX "ShopperStamp_userId_idx" ON "ShopperStamp"("userId");

CREATE UNIQUE INDEX "StampMilestone_userId_milestone_key" ON "StampMilestone"("userId", "milestone");
CREATE INDEX "StampMilestone_userId_idx" ON "StampMilestone"("userId");
