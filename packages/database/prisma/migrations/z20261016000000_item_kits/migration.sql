-- Kits (2026-10-16, Phase 1). Additive only: one boolean column on "Item" and one new table. No data is changed.
-- A kit is an Item with listingType 'KIT' (listingType is a plain text column, so no enum change).
-- "isKitComponent" is server-owned: true while the item is a component of any kit (lets the sale path skip kit work for ordinary items).
-- Rollback: DROP TABLE "ItemKitComponent"; ALTER TABLE "Item" DROP COLUMN "isKitComponent";  (kits themselves are Item rows with listingType 'KIT'; archive or delete those first)

ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "isKitComponent" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "ItemKitComponent" (
    "id" TEXT NOT NULL,
    "kitItemId" TEXT NOT NULL,
    "componentItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ItemKitComponent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ItemKitComponent_kitItemId_componentItemId_key" ON "ItemKitComponent"("kitItemId", "componentItemId");
CREATE INDEX IF NOT EXISTS "ItemKitComponent_componentItemId_idx" ON "ItemKitComponent"("componentItemId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ItemKitComponent_kitItemId_fkey') THEN
    ALTER TABLE "ItemKitComponent" ADD CONSTRAINT "ItemKitComponent_kitItemId_fkey" FOREIGN KEY ("kitItemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ItemKitComponent_componentItemId_fkey') THEN
    ALTER TABLE "ItemKitComponent" ADD CONSTRAINT "ItemKitComponent_componentItemId_fkey" FOREIGN KEY ("componentItemId") REFERENCES "Item"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
  END IF;
END
$$;
