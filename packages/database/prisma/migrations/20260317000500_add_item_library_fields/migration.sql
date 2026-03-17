-- #25: Add Item Library support fields to Item model
-- libraryId: optional link to future LibraryItem table namespace
-- inLibrary: cached flag for rapid filtering
-- priceVariants: per-sale pricing map (Phase 5)
-- organizerId: denormalized from sale.organizerId for library queries

ALTER TABLE "Item" ADD COLUMN "libraryId" TEXT;
ALTER TABLE "Item" ADD COLUMN "inLibrary" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Item" ADD COLUMN "priceVariants" JSONB;
ALTER TABLE "Item" ADD COLUMN "organizerId" TEXT;

-- Indexes for library filtering
CREATE INDEX "Item_libraryId_idx" ON "Item"("libraryId");
CREATE INDEX "Item_organizerId_inLibrary_idx" ON "Item"("organizerId", "inLibrary");
