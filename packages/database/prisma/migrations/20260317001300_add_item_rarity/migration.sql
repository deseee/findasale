-- Feature #57: Add ItemRarity enum and rarity field to Item model
CREATE TYPE "ItemRarity" AS ENUM ('COMMON', 'UNCOMMON', 'RARE', 'ULTRA_RARE', 'LEGENDARY');
ALTER TABLE "Item" ADD COLUMN "rarity" "ItemRarity" NOT NULL DEFAULT 'COMMON';
