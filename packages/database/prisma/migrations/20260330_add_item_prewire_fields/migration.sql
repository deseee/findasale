-- Pre-wire: Persistent Inventory fields
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "persistentInventory" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "masterItemLibraryId" TEXT;
