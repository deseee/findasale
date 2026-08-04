-- Data migration: convert existing ULTRA_RARE items to RARE ahead of
-- removing the ULTRA_RARE enum value. Postgres will not allow recasting
-- the rarity column to a new enum type that lacks ULTRA_RARE while any
-- row still holds that value -- this must run first and be applied first.
UPDATE "Item" SET "rarity" = 'RARE' WHERE "rarity" = 'ULTRA_RARE';
