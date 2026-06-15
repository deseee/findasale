-- Add AI package weight/dim estimate columns to Item
-- These are written by cloudAI on analysis, read by estimatePackageProfile step-4
ALTER TABLE "Item" ADD COLUMN "aiPackageWeightOz" INTEGER;
ALTER TABLE "Item" ADD COLUMN "aiPackageDimsJson" JSONB;
ALTER TABLE "Item" ADD COLUMN "aiPackageConfidence" DECIMAL(3,2);
