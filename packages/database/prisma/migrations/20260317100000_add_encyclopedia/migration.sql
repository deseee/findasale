-- Feature #52: Estate Sale Encyclopedia — Crowdsourced knowledge base

-- CreateTable: EncyclopediaEntry
DROP TABLE IF EXISTS "EncyclopediaVote";
DROP TABLE IF EXISTS "EncyclopediaReference";
DROP TABLE IF EXISTS "PriceBenchmark";
DROP TABLE IF EXISTS "EncyclopediaRevision";
DROP TABLE IF EXISTS "EncyclopediaEntry";

CREATE TABLE "EncyclopediaEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "slug" TEXT NOT NULL UNIQUE,
  "title" TEXT NOT NULL,
  "subtitle" TEXT,
  "content" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "tags" TEXT[] DEFAULT '{}',
  "authorId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "isFeatured" BOOLEAN NOT NULL DEFAULT false,
  "viewCount" INTEGER NOT NULL DEFAULT 0,
  "helpfulCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "EncyclopediaEntry_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT
);

-- CreateTable: EncyclopediaRevision
CREATE TABLE "EncyclopediaRevision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entryId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "tags" TEXT[] DEFAULT '{}',
  "authorId" TEXT NOT NULL,
  "changeNote" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EncyclopediaRevision_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "EncyclopediaEntry"("id") ON DELETE CASCADE,
  CONSTRAINT "EncyclopediaRevision_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT
);

-- CreateTable: PriceBenchmark
CREATE TABLE "PriceBenchmark" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entryId" TEXT NOT NULL,
  "condition" TEXT NOT NULL,
  "region" TEXT NOT NULL,
  "priceRangeLow" INTEGER NOT NULL,
  "priceRangeHigh" INTEGER NOT NULL,
  "dataSource" TEXT,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "PriceBenchmark_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "EncyclopediaEntry"("id") ON DELETE CASCADE
);

-- CreateTable: EncyclopediaReference
CREATE TABLE "EncyclopediaReference" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entryId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "source" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EncyclopediaReference_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "EncyclopediaEntry"("id") ON DELETE CASCADE
);

-- CreateTable: EncyclopediaVote
CREATE TABLE "EncyclopediaVote" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entryId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "helpful" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "EncyclopediaVote_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "EncyclopediaEntry"("id") ON DELETE CASCADE,
  CONSTRAINT "EncyclopediaVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT,
  UNIQUE("entryId", "userId")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EncyclopediaEntry_category_idx" ON "EncyclopediaEntry"("category");
CREATE INDEX IF NOT EXISTS "EncyclopediaEntry_status_idx" ON "EncyclopediaEntry"("status");
CREATE INDEX IF NOT EXISTS "EncyclopediaEntry_isFeatured_idx" ON "EncyclopediaEntry"("isFeatured");
CREATE INDEX IF NOT EXISTS "EncyclopediaEntry_authorId_idx" ON "EncyclopediaEntry"("authorId");
CREATE INDEX IF NOT EXISTS "EncyclopediaRevision_entryId_idx" ON "EncyclopediaRevision"("entryId");
CREATE INDEX IF NOT EXISTS "EncyclopediaRevision_authorId_idx" ON "EncyclopediaRevision"("authorId");
CREATE INDEX IF NOT EXISTS "PriceBenchmark_entryId_idx" ON "PriceBenchmark"("entryId");
CREATE INDEX IF NOT EXISTS "EncyclopediaReference_entryId_idx" ON "EncyclopediaReference"("entryId");
CREATE INDEX IF NOT EXISTS "EncyclopediaVote_entryId_idx" ON "EncyclopediaVote"("entryId");
CREATE INDEX IF NOT EXISTS "EncyclopediaVote_userId_idx" ON "EncyclopediaVote"("userId");
