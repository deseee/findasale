-- Add ebayCategoryName to Item table
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "ebayCategoryName" TEXT;
