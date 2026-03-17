-- CreateEnum
CREATE TYPE "TypologyCategory" AS ENUM (
  'ART_DECO',
  'MID_CENTURY_MODERN',
  'AMERICANA',
  'VICTORIAN',
  'INDUSTRIAL',
  'FARMHOUSE',
  'RETRO_ATOMIC',
  'PRIMITIVE_FOLK_ART',
  'ART_NOUVEAU',
  'CONTEMPORARY',
  'OTHER'
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ItemTypology" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "itemId" TEXT NOT NULL UNIQUE,
  "primaryCategory" "TypologyCategory" NOT NULL,
  "primaryConfidence" DOUBLE PRECISION NOT NULL,
  "secondaryCategory" "TypologyCategory",
  "secondaryConfidence" DOUBLE PRECISION,
  "rawResponse" JSONB,
  "organizer_reviewed" BOOLEAN NOT NULL DEFAULT false,
  "organizer_correctedTo" "TypologyCategory",
  "correctionReason" TEXT,
  "classifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ItemTypology_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "ItemTypology_itemId_idx" ON "ItemTypology"("itemId");
CREATE INDEX IF NOT EXISTS "ItemTypology_primaryCategory_idx" ON "ItemTypology"("primaryCategory");
