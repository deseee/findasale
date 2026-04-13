-- Add organizer-funded item discount fields (D-XP-003)
ALTER TABLE "Item" ADD COLUMN "organizerDiscountXp" INTEGER DEFAULT 0;
ALTER TABLE "Item" ADD COLUMN "organizerDiscountAmount" DECIMAL(10,2);
