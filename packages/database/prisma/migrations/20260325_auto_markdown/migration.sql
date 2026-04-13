-- Feature #91: Auto-Markdown (Smart Clearance)
-- Add markdown fields to Sale and Item models

-- Add to Sale model
ALTER TABLE "Sale" ADD COLUMN "markdownEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Sale" ADD COLUMN "markdownFloor" DOUBLE PRECISION;

-- Add to Item model
ALTER TABLE "Item" ADD COLUMN "priceBeforeMarkdown" DOUBLE PRECISION;
ALTER TABLE "Item" ADD COLUMN "markdownApplied" BOOLEAN NOT NULL DEFAULT false;
