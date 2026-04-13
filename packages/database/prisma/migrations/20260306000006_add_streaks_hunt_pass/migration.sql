-- CD2 Phase 2: Add Streak Challenges and Hunt Pass fields

-- Add columns to User table
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "streakPoints" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "visitStreak" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastVisitDate" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "huntPassActive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "huntPassExpiry" TIMESTAMP(3);

-- Create UserStreak table
CREATE TABLE IF NOT EXISTS "UserStreak" (
  "id" SERIAL NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "currentStreak" INTEGER NOT NULL DEFAULT 0,
  "longestStreak" INTEGER NOT NULL DEFAULT 0,
  "lastActivityDate" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserStreak_pkey" PRIMARY KEY ("id")
);

-- Create unique index for user+type
CREATE UNIQUE INDEX IF NOT EXISTS "UserStreak_userId_type_key" ON "UserStreak"("userId", "type");

-- Add foreign key constraint
ALTER TABLE "UserStreak" ADD CONSTRAINT "UserStreak_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
