-- Migration: add_item_size_color_material
-- 2026-08-18 (S-CROSSLISTER-ESTATE-VERTICAL-RESEARCH batch 5) -- adds Item.size/color/material,
-- mirroring the existing Item.brand column (plain nullable string, no enum/tags). Needed because
-- fas-poshmark.js/fas-mercari.js/fas-vinted.js/fas-grailed.js already reference
-- item.size/item.color/item.material -- those fields were added to schema.prisma directly in an
-- earlier commit this session WITHOUT a migration file, which is a CLAUDE.md Section 6 process
-- violation caught by a CI "Backend tests" failure (run #620): prisma generate produced a client
-- expecting these columns, but no real Postgres database (production Railway OR the CI ephemeral
-- test DB) ever actually had them added -- any Item query through ITEM_DETAIL_SELECT (which
-- explicitly selects size/color/material) would 42703 "column does not exist" in production right
-- now. This migration is additive-only (three nullable columns, no data risk) and closes that gap.
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "size" TEXT;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "color" TEXT;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "material" TEXT;
