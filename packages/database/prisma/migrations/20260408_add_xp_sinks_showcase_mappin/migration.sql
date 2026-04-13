-- Add customMapPin to User (Feature: Custom Map Pin XP sink)
ALTER TABLE "User" ADD COLUMN "customMapPin" VARCHAR(4);

-- Add showcaseSlots to User (Feature: Profile Showcase Slots)
ALTER TABLE "User" ADD COLUMN "showcaseSlots" INTEGER NOT NULL DEFAULT 1;

-- Create UserShowcase model for pinned haul posts on profile
CREATE TABLE "UserShowcase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "ugcPhotoId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserShowcase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE,
    CONSTRAINT "UserShowcase_ugcPhotoId_fkey" FOREIGN KEY ("ugcPhotoId") REFERENCES "UGCPhoto" ("id") ON DELETE SET NULL
);

-- Create unique constraint on userId + slotIndex
CREATE UNIQUE INDEX "UserShowcase_userId_slotIndex_key" ON "UserShowcase"("userId", "slotIndex");

-- Create index on userId for lookups
CREATE INDEX "UserShowcase_userId_idx" ON "UserShowcase"("userId");
