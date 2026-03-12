-- Add Camera Workflow v2 fields to Item
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "aiConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "backgroundRemoved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "faceDetected" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "autoEnhanced" BOOLEAN NOT NULL DEFAULT false;

-- Create Photo table for multi-photo support (forward-looking)
CREATE TABLE IF NOT EXISTS "Photo" (
  "id" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "label" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "autoEnhanced" BOOLEAN NOT NULL DEFAULT false,
  "backgroundRemoved" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- Create index on itemId for efficient querying
CREATE INDEX IF NOT EXISTS "Photo_itemId_idx" ON "Photo"("itemId");

-- Add foreign key constraint
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
