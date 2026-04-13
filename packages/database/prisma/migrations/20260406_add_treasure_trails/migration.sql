-- Add Treasure Trails (Explorer's Guild Phase 2) schema extensions and new tables
-- Extends existing TreasureTrail model with discovery-based trails
-- Adds TrailStop, TrailCheckIn, TrailPhoto, TrailCompletion, TrailRating models
-- Adds Organizer.trails and Sale.trails relations

-- Alter TreasureTrail table to support both legacy ROUTE trails and new DISCOVERY trails
ALTER TABLE "TreasureTrail" ADD COLUMN "organizerId" TEXT;
ALTER TABLE "TreasureTrail" ADD COLUMN "saleId" TEXT;
ALTER TABLE "TreasureTrail" ADD COLUMN "heroImageUrl" TEXT;
ALTER TABLE "TreasureTrail" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'ROUTE';
ALTER TABLE "TreasureTrail" ADD COLUMN "minStopsRequired" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "TreasureTrail" ADD COLUMN "maxStops" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "TreasureTrail" ADD COLUMN "windowDays" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "TreasureTrail" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "TreasureTrail" ADD COLUMN "isFeatured" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TreasureTrail" ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TreasureTrail" ADD COLUMN "completionCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TreasureTrail" ADD COLUMN "avgRating" DECIMAL;

-- Add foreign key constraints to TreasureTrail
ALTER TABLE "TreasureTrail" ADD CONSTRAINT "TreasureTrail_organizerId_fkey"
  FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE RESTRICT;
ALTER TABLE "TreasureTrail" ADD CONSTRAINT "TreasureTrail_saleId_fkey"
  FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE;

-- Create indexes on TreasureTrail
CREATE INDEX "TreasureTrail_organizerId_idx" ON "TreasureTrail"("organizerId");
CREATE INDEX "TreasureTrail_saleId_idx" ON "TreasureTrail"("saleId");
CREATE INDEX "TreasureTrail_isPublic_isFeatured_idx" ON "TreasureTrail"("isPublic", "isFeatured");
CREATE INDEX "TreasureTrail_type_idx" ON "TreasureTrail"("type");

-- New TrailStop table: individual stops on a discovery trail
CREATE TABLE "TrailStop" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "trailId" TEXT NOT NULL,
  "stopType" TEXT NOT NULL,
  "stopName" TEXT NOT NULL,
  "stopDescription" VARCHAR(300),
  "address" TEXT,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "saleId" TEXT,
  "googlePlaceId" TEXT,
  "googleRating" DECIMAL,
  "googlePhone" TEXT,
  "baseXp" INTEGER NOT NULL,
  "photoXpBonus" INTEGER NOT NULL DEFAULT 2,
  "order" INTEGER NOT NULL,
  "organizer_note" VARCHAR(200),
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL,
  FOREIGN KEY ("trailId") REFERENCES "TreasureTrail"("id") ON DELETE CASCADE,
  FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL,
  UNIQUE("trailId", "order")
);
CREATE INDEX "TrailStop_trailId_idx" ON "TrailStop"("trailId");
CREATE INDEX "TrailStop_stopType_idx" ON "TrailStop"("stopType");
CREATE INDEX "TrailStop_googlePlaceId_idx" ON "TrailStop"("googlePlaceId");

-- New TrailCheckIn table: user check-ins at stops
CREATE TABLE "TrailCheckIn" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "trailId" TEXT NOT NULL,
  "stopId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "baseXpAwarded" INTEGER NOT NULL,
  "photoXpAwarded" INTEGER NOT NULL DEFAULT 0,
  "photoId" TEXT,
  "checkedInAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("trailId") REFERENCES "TreasureTrail"("id") ON DELETE CASCADE,
  FOREIGN KEY ("stopId") REFERENCES "TrailStop"("id") ON DELETE CASCADE,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  UNIQUE("trailId", "stopId", "userId")
);
CREATE INDEX "TrailCheckIn_trailId_userId_idx" ON "TrailCheckIn"("trailId", "userId");
CREATE INDEX "TrailCheckIn_stopId_idx" ON "TrailCheckIn"("stopId");
CREATE INDEX "TrailCheckIn_userId_idx" ON "TrailCheckIn"("userId");
CREATE INDEX "TrailCheckIn_checkedInAt_idx" ON "TrailCheckIn"("checkedInAt");

-- New TrailPhoto table: photos posted at stops
CREATE TABLE "TrailPhoto" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "checkInId" TEXT NOT NULL,
  "stopId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "cloudinaryUrl" TEXT NOT NULL,
  "cloudinaryId" TEXT NOT NULL,
  "postedToFeed" BOOLEAN NOT NULL DEFAULT true,
  "likeCount" INTEGER NOT NULL DEFAULT 0,
  "commentCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("checkInId") REFERENCES "TrailCheckIn"("id") ON DELETE CASCADE,
  FOREIGN KEY ("stopId") REFERENCES "TrailStop"("id") ON DELETE CASCADE,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX "TrailPhoto_userId_idx" ON "TrailPhoto"("userId");
CREATE INDEX "TrailPhoto_stopId_idx" ON "TrailPhoto"("stopId");
CREATE INDEX "TrailPhoto_createdAt_idx" ON "TrailPhoto"("createdAt");

-- Add photoId foreign key to TrailCheckIn (deferred after TrailPhoto creation)
ALTER TABLE "TrailCheckIn" ADD CONSTRAINT "TrailCheckIn_photoId_fkey"
  FOREIGN KEY ("photoId") REFERENCES "TrailPhoto"("id") ON DELETE SET NULL;

-- New TrailCompletion table: completion tracking per user+trail
CREATE TABLE "TrailCompletion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "trailId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "completionBonusXp" INTEGER NOT NULL,
  "totalXpEarned" INTEGER NOT NULL,
  "stopCountCompleted" INTEGER NOT NULL,
  "photoCountPosted" INTEGER NOT NULL,
  "firstCheckInAt" TIMESTAMP NOT NULL,
  "completedAt" TIMESTAMP NOT NULL,
  "daysToComplete" INTEGER NOT NULL,
  "rating" INTEGER,
  "review" VARCHAR(300),
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL,
  FOREIGN KEY ("trailId") REFERENCES "TreasureTrail"("id") ON DELETE CASCADE,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  UNIQUE("trailId", "userId")
);
CREATE INDEX "TrailCompletion_trailId_idx" ON "TrailCompletion"("trailId");
CREATE INDEX "TrailCompletion_userId_idx" ON "TrailCompletion"("userId");
CREATE INDEX "TrailCompletion_completedAt_idx" ON "TrailCompletion"("completedAt");

-- New TrailRating table: shopper ratings of trails
CREATE TABLE "TrailRating" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "trailId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "review" VARCHAR(500),
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("trailId") REFERENCES "TreasureTrail"("id") ON DELETE CASCADE,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  UNIQUE("trailId", "userId")
);
CREATE INDEX "TrailRating_trailId_rating_idx" ON "TrailRating"("trailId", "rating");
