// One-time backfill: Item.ebayRenewalAnchorAt for existing eBay-listed items.
// Plain-JS twin of backfillEbayRenewalAnchors.ts — written to sidestep a broken local
// tsx/pnpm install (2026-09-15). Same logic, same safety behavior (dry run by default).
// Once tsx/ts-node are working again in this environment, prefer the .ts original;
// this .js file can be deleted then (it is not authoritative, the .ts file is).
//
// Run from packages/backend with plain node, no tsx/ts-node required:
//   node scripts/backfillEbayRenewalAnchors.js                    # dry run, all rows
//   node scripts/backfillEbayRenewalAnchors.js --limit 5          # dry run, 5 rows
//   node scripts/backfillEbayRenewalAnchors.js --item <itemId>    # dry run, 1 row
//   node scripts/backfillEbayRenewalAnchors.js --apply            # WRITES

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');
const limitArg = process.argv.indexOf('--limit');
const parsedLimit = limitArg !== -1 ? parseInt(process.argv[limitArg + 1], 10) : NaN;
const LIMIT = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined;
const itemArg = process.argv.indexOf('--item');
const ONLY_ITEM_IDS = itemArg !== -1
  ? process.argv.slice(itemArg + 1).filter((a) => !a.startsWith('--'))
  : [];

function requireEnv() {
  return ['DATABASE_URL'].filter((k) => !process.env[k]);
}

async function main() {
  const missing = requireEnv();
  if (missing.length > 0) {
    console.error(`Missing required env var(s): ${missing.join(', ')}`);
    console.error('DATABASE_URL lives in packages/database/.env for the live Railway proxy string.');
    process.exit(1);
  }

  console.log(
    `=== Item.ebayRenewalAnchorAt backfill (listedOnEbayAt proxy) — ${
      APPLY ? 'APPLY mode (WRITING)' : 'DRY RUN (no writes)'
    } ===\n`,
  );

  const items = await prisma.item.findMany({
    where: {
      status: 'AVAILABLE',
      ebayListingId: { not: null },
      ebayRenewalAnchorAt: null,
      ...(ONLY_ITEM_IDS.length > 0 ? { id: { in: ONLY_ITEM_IDS } } : {}),
    },
    select: {
      id: true,
      title: true,
      ebayListingId: true,
      listedOnEbayAt: true,
      ebayListedAt: true,
    },
    orderBy: { createdAt: 'asc' },
    take: LIMIT,
  });

  console.log(
    `Scanned ${items.length} AVAILABLE item(s) with a live ebayListingId and NULL ebayRenewalAnchorAt.\n`,
  );
  if (items.length === 0) {
    await prisma.$disconnect();
    return;
  }

  const rows = items.map((item) => ({
    id: item.id,
    title: item.title,
    ebayListingId: item.ebayListingId,
    listedOnEbayAt: item.listedOnEbayAt,
    ebayListedAt: item.ebayListedAt,
  }));

  const backfillable = rows.filter((r) => r.listedOnEbayAt !== null);
  const unresolvable = rows.filter((r) => r.listedOnEbayAt === null);

  console.log('--- Will backfill (ebayRenewalAnchorAt = listedOnEbayAt) ---------------------');
  for (const r of backfillable) {
    console.log(
      `${r.id}  listing=${r.ebayListingId}\n` +
        `    title:            ${r.title.slice(0, 70)}\n` +
        `    listedOnEbayAt:   ${r.listedOnEbayAt.toISOString()}  (-> ebayRenewalAnchorAt)\n` +
        `    ebayListedAt:     ${r.ebayListedAt ? r.ebayListedAt.toISOString() : 'NULL'}  (first-push-only, not used)`,
    );
  }

  if (unresolvable.length > 0) {
    console.log('\n--- Could NOT backfill (listedOnEbayAt is also NULL) -------------------------');
    for (const r of unresolvable) {
      console.log(
        `${r.id}  listing=${r.ebayListingId}  title: ${r.title.slice(0, 60)}  ` +
          `reason: listedOnEbayAt is NULL — no proxy timestamp available. ` +
          `Leave ebayRenewalAnchorAt null; the forecast cron will treat it as "not counted" ` +
          `until this item goes through a real FAS-driven eBay push.`,
      );
    }
  }

  console.log(
    `\nSummary: ${backfillable.length} backfillable, ${unresolvable.length} unresolvable, out of ${rows.length} scanned.`,
  );

  if (!APPLY) {
    console.log('\nDRY RUN — nothing was written. Re-run with --apply to write the values above.');
    await prisma.$disconnect();
    return;
  }

  let updated = 0;
  for (const r of backfillable) {
    await prisma.item.update({
      where: { id: r.id },
      data: { ebayRenewalAnchorAt: r.listedOnEbayAt },
    });
    updated++;
  }
  console.log(`\nAPPLIED — wrote ebayRenewalAnchorAt on ${updated} item(s).`);
  console.log(
    'Note: ebayNextRenewalAt was NOT computed by this script. It will be populated on the ' +
      'next run of ebayRenewalForecastCron.ts.',
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
