# Next Session Resume Prompt
*Written: 2026-03-10T23:59:00Z*
*Session ended: normally — session 133 complete*

## Resume From

Create a Prisma migration to add the missing `Item.tags` column to production, then audit all remaining Item endpoints that use bare `include` (they will all hit the same P2022 crash).

## What Was In Progress

Nothing mid-task — all work this session was completed and verified.

## What Was Completed This Session

- **Session 128 regressions restored** on `add-items/[saleId].tsx`: torch toggle, camera switch, photo upload, tab reorder, bulk delete (commit faa16f4)
- **AI vendor branding genericized** in `faq.tsx` + `privacy.tsx`: "Google Vision" / "Claude Haiku" → "AI" (commit aa7ae46)
- **add-items/[saleId].tsx** additional fixes: tab label order, photo upload wiring, bulk delete (commit d7648e1)
- **P0 edit-item crash fixed**: `getItemById` was crashing P2022 because `Item.tags` column missing from production DB. Switched from bare `include` to explicit `select` (excludes `tags` + `embedding`). Commit aa13deb. Verified live in Chrome — edit-item page fully working.

## Environment Notes

- Patrick needs to sync local repo: `git stash && git pull && git stash drop`
- Railway deployed commit aa13deb — confirmed working
- No pending migrations from this session

## Exact Context

**The core schema drift issue:**
- `tags String[] @default([])` exists in `packages/database/prisma/schema.prisma` (Item model, line ~191)
- NO migration was ever created for this field on the Item table
- The init migration (`20260223014340_init`) has `"tags" TEXT[]` at line 59, but that's in the **Sale** table, not Item
- Fix 1 (done): `getItemById` now uses `select` to avoid querying `tags`
- Fix 2 (needed): create migration: `ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "tags" TEXT[] DEFAULT '{}'`

**Other endpoints still using bare `include` on Item (will also P2022 if `tags` is queried):**
- `updateItem` — line ~399: `prisma.item.findUnique({ where: { id }, include: { sale: { include: { organizer: ... } } } })`
- `deleteItem` — line ~486: same pattern
- `analyzeItemTags` — line ~522: same pattern
- `getItemForOrganizer` helper — line ~570: same pattern (used by photo add/remove/reorder endpoints)
- `bulkUpdateItems` — line ~695: `prisma.item.findMany({ where: ..., include: ... })`
- `exportItems` — line ~815: `prisma.item.findMany({ where: { saleId }, orderBy: ... })` — no select, hits all columns
- `placeBid` — line ~858: `prisma.item.findUnique({ where: { id }, include: ... })`

These are primarily write paths — less frequently hit, but still broken. The cleanest fix is the migration (then these can stay as-is). If migration is blocked, each needs a `select` patch like `getItemById`.

**Current GitHub SHA for itemController.ts:** `d913f988d26c683afc69b481b9af330f7b618ad8`

**Remaining carry-forwards (not from this session):**
- Camera tab on add-items/[saleId].tsx — "coming soon" regression still unresolved
- BUG-3 (/organizer/items 404) — deferred
- Patrick's beta-blocking items: Stripe business account, Google Search Console, business cards, beta organizer outreach
