-- AlterTable UGCPhoto: Add micro-sink XP flow fields
-- D-XP-006: Scout Reveal (5 XP), Haul Unboxing (2 XP), Bump Post (10 XP)

ALTER TABLE "UGCPhoto" ADD COLUMN "scoutReveals" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "UGCPhoto" ADD COLUMN "unboxingAnimationUnlocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UGCPhoto" ADD COLUMN "bumpedUntil" TIMESTAMP(3);
