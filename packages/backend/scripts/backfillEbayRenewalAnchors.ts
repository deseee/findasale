// One-time backfill: Item.ebayRenewalAnchorAt for existing eBay-listed items.
//
// ─── Why this exists ──────────────────────────────────────────────────────────────────
// ADR: claude_docs/feature-notes/adr-ebay-renewal-forecasting-2026-09-15.md
//
// ebayRenewalAnchorAt is new as of migration
// 20260915140000_add_item_price_provenance_and_ebay_renewal_tracking and is null on every
// existing row. Going forward it is set by the eBay-publish code paths themselves whenever
// a NEW ebayListingId is assigned (first push, or the self-heal delete+recreate-offer
// path) — see Dev Instructions step 3 of the ADR. This script is the one-time catch-up for
// items that were already live on eBay BEFORE that code shipped.
//
// Per the ADR's Migration Plan, the backfill value is `listedOnEbayAt`, NOT `ebayListedAt`:
//   - Item.ebayListedAt is set once, on first push, and deliberately never updated on
//     relist (see ebayController.ts's own comment at both write sites).
//   - Item.listedOnEbayAt IS overwritten on every publish/relist call, making it the
//     closer available proxy for "most recent listing/relist event."
// This is an approximation, not an eBay-confirmed value — acceptable because the whole
// renewal forecast is explicitly framed as an estimate (see the ADR's Consequences /
// Constraints Added sections), not acceptable to silently present as exact.
//
// ─── Scope ────────────────────────────────────────────────────────────────────────────
// Targets: Item.status = 'AVAILABLE' AND ebayListingId IS NOT NULL AND
// ebayRenewalAnchorAt IS NULL. Rows with listedOnEbayAt also NULL cannot be backfilled
// (no proxy timestamp available) and are reported separately, not silently skipped.
//
// ebayNextRenewalAt is intentionally NOT computed or written by this script — that is
// ebayRenewalForecastCron.ts's job (nightly, pure arithmetic off ebayRenewalAnchorAt).
// This script only seeds the anchor; the forecast cron picks it up on its next run.
//
// ─── Safety ───────────────────────────────────────────────────────────────────────────
// DRY RUN by default — prints a full before/after table and writes nothing. Pass --apply
// to write. --limit N and --item <id> exist so a handful of rows can be proven correct
// before any batch runs. This is production data; run the dry run and read the output
// first. This script does NOT call eBay — it only reads/writes FAS's own database.
//
// ─── Required environment ────────────────────────────────────────────────────────────
//   DATABASE_URL   (packages/database/.env holds the live Railway proxy string)
//
// Run from packages/backend:
//   npx tsx scripts/backfillEbayRenewalAnchors.ts                    # dry run, all rows
//   npx tsx scripts/backfillEbayRenewalAnchors.ts --limit 5          # dry run, 5 rows
//   npx tsx scripts/backfillEbayRenewalAnchors.ts --item <itemId>    # dry run, 1 row
//   npx tsx scripts/backfillEbayRenewalAnchors.ts --apply            # WRITES

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');
const limitArg = process.argv.indexOf('--limit');
const parsedLimit = limitArg !== -1 ? parseInt(process.argv[limitArg + 1], 10) : NaN;
const LIMIT: number | undefined = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined;
const itemArg = process.argv.indexOf('--item');
const ONLY_ITEM_IDS: string[] = itemArg !== -1
  ? process.argv.slice(itemArg + 1).filter((a) => !a.startsWith('--'))
  : [];

interface Row {
  id: string;
  title: string;
  ebayListingId: string;
  listedOnEbayAt: Date | null;
  ebayListedAt: Date | null;
}

function requireEnv(): string[] {
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
    take: LIMIT, // undefined = no limit (Prisma ignores an undefined take)
  });

  console.log(
    `Scanned ${items.length} AVAILABLE item(s) with a live ebayListingId and NULL ebayRenewalAnchorAt.\n`,
  );
  if (items.length === 0) {
    await prisma.$disconnect();
    return;
  }

  const rows: Row[] = items.map((item) => ({
    id: item.id,
    title: item.title,
    ebayListingId: item.ebayListingId as string,
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
        `    listedOnEbayAt:   ${r.listedOnEbayAt!.toISOString()}  (-> ebayRenewalAnchorAt)\n` +
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
      data: { ebayRenewalAnchorAt: r.listedOnEbayAt! },
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
