-- Feature #45: Collector Passport — identity-based collection tracking
-- Shoppers define what they collect with keywords + categories, get personalized alerts

CREATE TABLE "CollectorPassport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bio" TEXT,
    "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notifyEmail" BOOLEAN NOT NULL DEFAULT true,
    "notifyPush" BOOLEAN NOT NULL DEFAULT true,
    "totalFinds" INTEGER NOT NULL DEFAULT 0,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectorPassport_pkey" PRIMARY KEY ("id")
);

-- User_id is unique (one passport per user)
CREATE UNIQUE INDEX "CollectorPassport_userId_key" ON "CollectorPassport"("userId");
CREATE INDEX "CollectorPassport_userId_idx" ON "CollectorPassport"("userId");

-- Foreign key constraint
ALTER TABLE "CollectorPassport" ADD CONSTRAINT "CollectorPassport_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
