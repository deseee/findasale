-- AlterEnum
-- Removes the deprecated ULTRA_RARE value from ItemRarity. PostgreSQL has no
-- direct "DROP VALUE" for enums, so Prisma's migration engine rebuilds the
-- type: create a replacement type without the removed value, cast the
-- column across using a text round-trip, swap the type names, drop the old
-- type, then restore the column default. The prior data migration
-- (20260804120000_merge_ultra_rare_into_rare_data) must be applied first so
-- no row still holds 'ULTRA_RARE' when the USING cast below runs.
BEGIN;
CREATE TYPE "ItemRarity_new" AS ENUM ('COMMON', 'UNCOMMON', 'RARE', 'LEGENDARY');
ALTER TABLE "Item" ALTER COLUMN "rarity" DROP DEFAULT;
ALTER TABLE "Item" ALTER COLUMN "rarity" TYPE "ItemRarity_new" USING ("rarity"::text::"ItemRarity_new");
ALTER TYPE "ItemRarity" RENAME TO "ItemRarity_old";
ALTER TYPE "ItemRarity_new" RENAME TO "ItemRarity";
DROP TYPE "ItemRarity_old";
ALTER TABLE "Item" ALTER COLUMN "rarity" SET DEFAULT 'COMMON';
COMMIT;
