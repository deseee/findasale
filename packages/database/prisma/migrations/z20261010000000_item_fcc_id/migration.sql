-- Item.fccId: optional FCC ID for electronics (additive, nullable).
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "fccId" TEXT;
