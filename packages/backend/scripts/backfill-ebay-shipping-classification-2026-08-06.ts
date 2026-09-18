// One-off backfill for the P0 finding root-caused this session (see
// claude_docs/STATE.md Blocked Queue row + audit
// claude_docs/ux-spotchecks/ebay-shipping-settings-simplification-2026-08-06.md):
// Item.ebayShippingClassification (schema.prisma, String @default("UNKNOWN")) was
// NEVER written by any backend write path -- classifyEbayShipping() was only ever
// computed ephemeral, inline, for API-response display in ebayController.ts. Confirmed
// via direct production DB query: 100% of items platform-wide (262/262, every
// organizer, item creation dates 2026-04-15 through 2026-08-05) were stuck on the
// untouched schema default 'UNKNOWN'. Real-world effect: the shipping-cascade step
// that auto-routes HEAVY_OVERSIZED/FRAGILE items to the right eBay fulfillment policy
// (resolvePoliciesForItem step 8, ebayController.ts) never fired once in the
// platform's history -- every item silently fell through to the UNKNOWN fallback
// policy instead.
//
// This session's dev fix (findasale-dev dispatch) added classifyEbayShipping() calls
// to every real Item write site that sets category and/or tags (13 write sites across
// 7 files: batchAnalyzeController.ts, itemController.ts x3, ebayController.ts x4,
// syncController.ts x2, routes/items.ts, reanalyzeService.ts, processRapidDraft.ts x2)
// so all FUTURE writes stay in sync going forward. This script is the one-time
// backfill for the 262 (and growing, until this script runs) EXISTING items already
// stuck on 'UNKNOWN'.
//
// Scope: mirrors the exact scope used by the live product's own
// getUnknownShippingClassificationCount() (ebayController.ts) -- no sale.status
// filter, no organizer scope, just `ebayShippingClassification: 'UNKNOWN'` across
// every organizer. Reads each such item's current category + tags and recomputes.
//
// Safety: only WRITES when the computed classification is an actual improvement
// (SHIPPABLE / HEAVY_OVERSIZED / FRAGILE) -- rows that would still classify as
// UNKNOWN (empty/unrecognized category+tags) are left untouched, so this never
// churns rows for no reason. This also makes the script safe to run twice: after
// this backfill + the write-path fix are both live, a second run will find zero
// UNKNOWN-with-real-data items left (new items are already classified correctly on
// write; already-backfilled items are no longer 'UNKNOWN' so the where-filter
// naturally excludes them).
//
// Read-only until --apply is passed. Prints exactly what it would change first.
// Not wired into any cron -- run manually, once, by hand.
//
// Requires DATABASE_URL in the environment (pulled fresh from
// packages/database/.env or the Railway proxy connection string -- never
// hardcoded here). PrismaClient below reads it automatically from process.env.
//
// Run from packages/backend:
//   npx tsx scripts/backfill-ebay-shipping-classification-2026-08-06.ts
//   npx tsx scripts/backfill-ebay-shipping-classification-2026-08-06.ts --apply

import { PrismaClient } from '@prisma/client';
import { classifyEbayShipping, ShippingClassification } from '../src/utils/ebayShippingClassifier';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

async function main() {
  console.log(`=== eBay shipping classification backfill — ${APPLY ? 'APPLY mode (writing)' : 'DRY RUN (no writes)'} ===\n`);

  // Same scope as the live product's own getUnknownShippingClassificationCount()
  // (ebayController.ts): no sale.status filter, no organizer scope -- every item
  // platform-wide currently stuck on the schema default.
  const items = await prisma.item.findMany({
    where: { ebayShippingClassification: 'UNKNOWN' },
    select: { id: true, title: true, category: true, tags: true, organizerId: true },
  });

  console.log(`Scanned ${items.length} item(s) with ebayShippingClassification = 'UNKNOWN'.\n`);

  let updated = 0;
  const newCounts: Record<ShippingClassification, number> = {
    SHIPPABLE: 0,
    HEAVY_OVERSIZED: 0,
    FRAGILE: 0,
    UNKNOWN: 0,
  };

  for (const item of items) {
    const computed = classifyEbayShipping(item.category, item.tags);

    if (computed === 'UNKNOWN') {
      // No real improvement possible from current category/tags data — leave alone,
      // don't churn the row.
      newCounts.UNKNOWN++;
      continue;
    }

    newCounts[computed]++;
    updated++;

    console.log(
      `${APPLY ? '[APPLY]' : '[DRY RUN]'} item=${item.id} title="${(item.title || '').slice(0, 60)}" ` +
        `category=${JSON.stringify(item.category)} tags=${JSON.stringify(item.tags)} ` +
        `UNKNOWN -> ${computed}`
    );

    if (APPLY) {
      await prisma.item.update({
        where: { id: item.id },
        data: { ebayShippingClassification: computed },
      });
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Total items scanned (ebayShippingClassification = 'UNKNOWN' at start): ${items.length}`);
  console.log(`Total ${APPLY ? 'updated' : 'that WOULD be updated with --apply'}: ${updated}`);
  console.log('Breakdown of new classification for the updated rows:');
  console.log(`  SHIPPABLE:       ${newCounts.SHIPPABLE}`);
  console.log(`  HEAVY_OVERSIZED: ${newCounts.HEAVY_OVERSIZED}`);
  console.log(`  FRAGILE:         ${newCounts.FRAGILE}`);
  console.log(`Still UNKNOWN (no usable category/tags data — left unchanged): ${newCounts.UNKNOWN}`);

  if (!APPLY && updated > 0) {
    console.log('\nThis was a DRY RUN — no writes were made. Re-run with --apply to write these changes.');
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
