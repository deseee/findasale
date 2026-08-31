// One-time backfill for existing items that already have a category/title but were
// created before ADR-package-profile-autoconfirm-2026-08-31 shipped, so they never got
// a chance to pick up a curated PackageProfile match (source CATEGORY/KEYWORD,
// confidence >= 0.55) via computeEffectivePackageWeight()'s new conditional auto-write.
//
// Patrick's literal complaint (2026-08-31): existing records/CDs/comics/coins etc. show
// no weight/dimensions on their own item page even though the shipping-rate calculation
// already resolves correctly via the live estimatePackageProfile() cascade -- because
// that resolved value was, until this ADR, never persisted anywhere. The new write-path
// fix in computeEffectivePackageWeight() (ebayController.ts) only fires for items that
// pass through one of its 3 real callers (FB extension export, the "Get AI estimate"
// endpoints); it does not by itself reach items nobody has queried an estimate for. This
// script closes that gap in one shot.
//
// Scope: every Item where packageWeightOz IS NULL, packageConfirmedByOrganizer IS NOT
// TRUE, and ebayShippingOverride IS NULL (skips items already classified LOCAL_PICKUP_ONLY
// -- see applyNeverShippableOverride, a separate concern). No sale.status or organizer
// filter -- matches the same broad platform-wide scope used by this codebase's other
// one-time backfills (see backfill-ebay-shipping-classification-2026-08-06.ts).
//
// For each matching item, calls the SAME computeEffectivePackageWeight() function the
// live write paths use -- no separate/duplicated cascade logic. That function already
// contains its own conditional auto-write (only fires for source CATEGORY/KEYWORD,
// confidence >= 0.55 -- see ADR-package-profile-autoconfirm-2026-08-31.md), so this
// script's job is simply to CALL it for every eligible item; the function itself decides
// whether to write. Items that only resolve to source AI or SEED are correctly left
// untouched by computeEffectivePackageWeight() itself -- they still require the
// organizer's manual "Get AI estimate" + Save, unchanged by this ADR.
//
// Batches in chunks of 200 to avoid a long-held read against a large item table.
// Read-only until --apply is passed -- prints exactly what it would change first.
// Not wired into any cron -- run manually, once, by hand. Safe to re-run: any item this
// script (or the live write path) already updated no longer matches the
// packageWeightOz IS NULL filter, so a second run naturally finds fewer/zero candidates.
//
// Requires DATABASE_URL in the environment (pulled fresh from packages/database/.env or
// the Railway proxy connection string -- never hardcoded here). PrismaClient below reads
// it automatically from process.env.
//
// Run from packages/backend:
//   npx tsx scripts/backfillCuratedPackageEstimates.ts
//   npx tsx scripts/backfillCuratedPackageEstimates.ts --apply

import { PrismaClient } from '@prisma/client';
import { computeEffectivePackageWeight } from '../src/controllers/ebayController';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const BATCH_SIZE = 200;

async function main() {
  console.log(`=== Curated PackageProfile auto-confirm backfill — ${APPLY ? 'APPLY mode (writing)' : 'DRY RUN (no writes)'} ===\n`);

  if (!APPLY) {
    console.log(
      'DRY RUN: computeEffectivePackageWeight() only writes when it internally decides to ' +
      '(source CATEGORY/KEYWORD, confidence >= 0.55). This script cannot preview that ' +
      'decision without calling it, and calling it IS what would write in --apply mode. ' +
      'In dry-run mode we instead just report how many items are IN SCOPE (eligible to be ' +
      'evaluated) — re-run with --apply to actually evaluate + write.\n'
    );
  }

  const where = {
    packageWeightOz: null,
    packageConfirmedByOrganizer: { not: true },
    ebayShippingOverride: null,
  } as const;

  const total = await prisma.item.count({ where });
  console.log(`Scanned ${total} item(s) with packageWeightOz IS NULL, not organizer-confirmed, no shipping override.\n`);

  if (!APPLY) {
    console.log('This was a DRY RUN — no items were evaluated or written. Re-run with --apply to process these items.');
    await prisma.$disconnect();
    return;
  }

  let processed = 0;
  let autoConfirmed = 0; // best-effort count via before/after packageConfirmedByOrganizer check
  let skipped = 0;
  let cursor: string | undefined;

  for (;;) {
    const batch = await prisma.item.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        ebayCategoryId: true,
        ebayShippingOverride: true,
        packageConfirmedByOrganizer: true,
        packageWeightOz: true,
        packageLengthIn: true,
        packageWidthIn: true,
        packageHeightIn: true,
        packageType: true,
        aiPackageWeightOz: true,
        aiPackageDimsJson: true,
        aiPackageConfidence: true,
      },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
    });

    if (batch.length === 0) break;

    for (const item of batch) {
      processed++;
      try {
        await computeEffectivePackageWeight({
          id: item.id,
          title: item.title,
          description: item.description,
          category: item.category,
          ebayCategoryId: item.ebayCategoryId,
          ebayShippingOverride: item.ebayShippingOverride,
          packageConfirmedByOrganizer: item.packageConfirmedByOrganizer,
          packageWeightOz: item.packageWeightOz,
          packageLengthIn: item.packageLengthIn != null ? Number(item.packageLengthIn) : null,
          packageWidthIn: item.packageWidthIn != null ? Number(item.packageWidthIn) : null,
          packageHeightIn: item.packageHeightIn != null ? Number(item.packageHeightIn) : null,
          packageType: item.packageType,
          aiPackageWeightOz: item.aiPackageWeightOz,
          aiPackageDimsJson: item.aiPackageDimsJson,
          aiPackageConfidence: item.aiPackageConfidence != null ? Number(item.aiPackageConfidence) : null,
        });
      } catch (e: any) {
        console.warn(`[backfill] computeEffectivePackageWeight threw for item ${item.id}:`, e?.message || e);
        skipped++;
        continue;
      }

      // Re-check whether this item is now confirmed (the function's own internal write,
      // if it fired, sets packageConfirmedByOrganizer=true).
      const after = await prisma.item.findUnique({
        where: { id: item.id },
        select: { packageConfirmedByOrganizer: true, packageEstimateSource: true, packageWeightOz: true },
      });
      if (after?.packageConfirmedByOrganizer === true) {
        autoConfirmed++;
        console.log(`[APPLY] item=${item.id} auto-confirmed source=${after.packageEstimateSource} weightOz=${after.packageWeightOz}`);
      } else {
        skipped++;
      }
    }

    cursor = batch[batch.length - 1].id;
    console.log(`... processed ${processed}/${total} so far (${autoConfirmed} auto-confirmed, ${skipped} skipped/no-match)`);
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Total items in scope: ${total}`);
  console.log(`Total processed: ${processed}`);
  console.log(`Auto-confirmed (curated CATEGORY/KEYWORD match, confidence >= 0.55): ${autoConfirmed}`);
  console.log(`Skipped/no qualifying match (source AI/SEED, low confidence, or lookup failed — left for manual "Get AI estimate"): ${skipped}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
