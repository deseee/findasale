/**
 * Reclassify mis-typed Sales — DRY-RUN-ONLY analysis tool.
 *
 * PROBLEM
 * -------
 * Among PUBLISHED, non-container Sales, many rows have "auction" or "estate sale"
 * in their title but a saleType that does not match. These rows are MIXED:
 *
 *   - Genuine dated EVENTS mis-typed as YARD/ESTATE that SHOULD flip
 *       e.g. "ONLINE AUCTION_June 7-14 ..."  (saleType=ESTATE → should be AUCTION)
 *   - Auction-HOUSE / estate-sale-COMPANY BUSINESSES correctly typed RETAIL
 *       e.g. "Nellis Auction — Auction House in Houston, TX" (RETAIL → must NOT flip)
 *
 * This script identifies ONLY the genuine dated events using conservative
 * predicates and reports what WOULD flip. It never mutates data unless an
 * explicit --apply flag is passed (and even then it is guarded by an env gate).
 *
 * DATA EVIDENCE (read-only SELECTs, Railway prod, S-this-session)
 * ---------------------------------------------------------------
 * Among PUBLISHED non-container Sales with 'auction' in title:
 *   - YARD/ESTATE candidates come almost entirely from EVENT sources
 *     (EstateSalesNet 502, GarageSaleFinder 169) — genuine auction events.
 *   - RETAIL business rows (61) come from PLACES sources
 *     (HEREPlaces 43, Foursquare 18) and carry the "— <Category> in City, ST"
 *     em-dash places suffix, which appears in ZERO YARD/ESTATE event rows.
 * The "— ... in City, ST" em-dash places suffix is therefore the single
 * strongest business signal; business-word patterns (auction house / co /
 * company / auctioneers / gallery / group / service) catch the long tail.
 *
 * RULE SUMMARY
 * ------------
 * AUCTION flip candidate (YARD or ESTATE → AUCTION) requires ALL of:
 *   1. status = 'PUBLISHED' AND isInventoryContainer = false
 *   2. saleType IN ('YARD','ESTATE')           — RETAIL presumed business, EXCLUDED
 *   3. title contains an AUCTION EVENT signal   — see AUCTION_EVENT_PATTERNS
 *   4. title contains NO business signal        — see BUSINESS_PATTERNS
 *
 * ESTATE flip candidate (YARD → ESTATE) requires ALL of:
 *   1. status = 'PUBLISHED' AND isInventoryContainer = false
 *   2. saleType = 'YARD'                        — RETAIL/ESTATE excluded
 *   3. title contains 'estate sale'
 *   4. title contains NO business signal        — see BUSINESS_PATTERNS
 *   5. title contains NO auction signal         — an estate-AUCTION should go
 *      to the AUCTION rule, not the ESTATE rule (avoid double-claiming)
 *
 * RETAIL rows are NEVER flipped by either rule.
 *
 * USAGE
 * -----
 *   # Dry run (default) — read-only, writes NOTHING:
 *   DATABASE_URL="<railway>" npx tsx src/scripts/reclassify-mistyped-sales.ts
 *
 *   # Apply (DANGEROUS — double-gated, intentionally NOT run by automation):
 *   DATABASE_URL="<railway>" RECLASSIFY_CONFIRM_APPLY=YES \
 *     npx tsx src/scripts/reclassify-mistyped-sales.ts --apply
 *
 * Environment: DATABASE_URL must point to the Railway DB (never localhost).
 */

import { prisma } from '../lib/prisma';

// --apply only takes effect if BOTH the flag AND the env confirmation are present.
const APPLY = process.argv.includes('--apply');
const APPLY_CONFIRMED = process.env.RECLASSIFY_CONFIRM_APPLY === 'YES';

interface SaleRow {
  id: string;
  title: string;
  saleType: string;
  sourceName: string | null;
  city: string;
  state: string;
}

/**
 * Business signals — if a title matches ANY of these it is presumed to be a
 * business listing (auction house, estate-sale company, places-scrape result)
 * and is EXCLUDED from flipping, regardless of other signals.
 *
 * The em-dash places suffix `— ... in <City>, <ST>` is the dominant signal:
 * it is how HEREPlaces / Foursquare format business listings and appears in
 * ZERO genuine event rows.
 */
const BUSINESS_PATTERNS: RegExp[] = [
  / — .* in [A-Za-z .'-]+, [A-Za-z]{2}\b/i, // "— Auction House in Houston, TX" places suffix
  /auction house/i,
  /auctioneer/i,             // auctioneer / auctioneers
  /auction co\b/i,           // "Auction Co" / "Auction Co."
  /auction company/i,
  /auction gallery/i,
  /auction group/i,
  /auction service/i,        // "Online Auction Service" / "Auction Services"
  /estate sale company/i,
  /estate liquidator/i,      // "Estate Liquidators & Auctioneers"
  /\bllc\b/i,                // company entity marker
  /\binc\.?\b/i,
];

/**
 * Auction EVENT signals — a title must match at least ONE of these to be a
 * candidate for AUCTION. These describe dated/numbered/named auction events,
 * not businesses.
 */
const AUCTION_EVENT_PATTERNS: RegExp[] = [
  /online auction/i,
  /live auction/i,
  /estate auction/i,
  /public auction/i,
  /\bauction\b.*#\s*\d+/i,                 // "Auction #131"
  /\bauction\b.*\bpart\s*\d+/i,            // "... Auction Part 1"
  /auction\b.*\b\d{1,2}\/\d{1,2}/,         // "Auction 6/22" date
  /\b\d{1,2}\/\d{1,2}.*auction/i,          // "6/22 ... Auction"
  /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}.*auction/i, // "June 10 ... Auction"
  /auction.*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}/i, // "Auction ... June 10"
  /(mon|tues|wednes|thurs|fri|satur|sun)day.*auction/i,                          // day-of-week + auction
  /auction.*(mon|tues|wednes|thurs|fri|satur|sun)day/i,
  /auction\s+ending/i,                     // "Auction Ending 6/22"
  /\bauction\b/i,                          // fallback: contains the word "auction" as a discrete word
];

function matchesAny(title: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(title));
}

function isAuctionFlipCandidate(s: SaleRow): boolean {
  if (s.saleType !== 'YARD' && s.saleType !== 'ESTATE') return false; // RETAIL excluded
  if (matchesAny(s.title, BUSINESS_PATTERNS)) return false;           // business excluded
  return matchesAny(s.title, AUCTION_EVENT_PATTERNS);                 // must look like an event
}

function isEstateFlipCandidate(s: SaleRow): boolean {
  if (s.saleType !== 'YARD') return false;                            // only YARD → ESTATE
  if (!/estate sale/i.test(s.title)) return false;
  if (matchesAny(s.title, BUSINESS_PATTERNS)) return false;           // business excluded
  if (/\bauction\b/i.test(s.title)) return false;                    // estate-auctions go to AUCTION rule
  return true;
}

function tallyBy<T>(rows: T[], key: (r: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = key(r);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function printTally(label: string, counts: Record<string, number>): void {
  console.log(`  ${label}:`);
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, n]) => console.log(`    ${String(n).padStart(5)}  ${k}`));
}

async function main(): Promise<void> {
  console.log('='.repeat(78));
  console.log('RECLASSIFY MIS-TYPED SALES — DRY-RUN ANALYSIS');
  console.log(`Mode: ${APPLY ? 'APPLY (mutating)' : 'DRY-RUN (read-only, no writes)'}`);
  console.log('='.repeat(78));

  // Pull every PUBLISHED non-container sale whose title contains the trigger words.
  // We read a superset and classify in TypeScript so the rule is fully auditable.
  const rows = (await prisma.sale.findMany({
    where: {
      status: 'PUBLISHED',
      isInventoryContainer: false,
      OR: [
        { title: { contains: 'auction', mode: 'insensitive' } },
        { title: { contains: 'estate sale', mode: 'insensitive' } },
      ],
    },
    select: { id: true, title: true, saleType: true, sourceName: true, city: true, state: true },
  })) as SaleRow[];

  console.log(`\nLoaded ${rows.length} candidate rows (title contains 'auction' or 'estate sale').`);

  // ---------- AUCTION RULE ----------
  const auctionTitled = rows.filter((r) => /auction/i.test(r.title));
  const auctionFlips = auctionTitled.filter(isAuctionFlipCandidate);
  // Borderline = has 'auction' in title, NOT already AUCTION, but rule leaves it alone.
  const auctionExcluded = auctionTitled.filter(
    (r) => r.saleType !== 'AUCTION' && !isAuctionFlipCandidate(r),
  );

  console.log('\n' + '-'.repeat(78));
  console.log('AUCTION RULE — would flip saleType → AUCTION');
  console.log('-'.repeat(78));
  console.log(`  Total candidates that WOULD flip: ${auctionFlips.length}`);
  printTally('Breakdown by current saleType', tallyBy(auctionFlips, (r) => r.saleType));
  printTally('Breakdown by sourceName', tallyBy(auctionFlips, (r) => r.sourceName ?? '(null)'));

  console.log('\n  Representative titles that WOULD flip (up to 30):');
  auctionFlips.slice(0, 30).forEach((r) =>
    console.log(`    [${r.saleType} | ${r.sourceName ?? 'null'}] ${r.title}`),
  );

  console.log(
    `\n  Borderline / EXCLUDED rows (title has 'auction', NOT already AUCTION, rule leaves alone): ${auctionExcluded.length}`,
  );
  printTally('  Excluded breakdown by current saleType', tallyBy(auctionExcluded, (r) => r.saleType));
  printTally('  Excluded breakdown by sourceName', tallyBy(auctionExcluded, (r) => r.sourceName ?? '(null)'));
  console.log('\n  Sample EXCLUDED titles (audit for false-negatives — up to 30):');
  auctionExcluded.slice(0, 30).forEach((r) =>
    console.log(`    [${r.saleType} | ${r.sourceName ?? 'null'}] ${r.title}`),
  );

  // ---------- ESTATE RULE ----------
  const estateTitled = rows.filter((r) => /estate sale/i.test(r.title));
  const estateFlips = estateTitled.filter(isEstateFlipCandidate);
  const estateExcluded = estateTitled.filter(
    (r) => r.saleType !== 'ESTATE' && !isEstateFlipCandidate(r),
  );

  console.log('\n' + '-'.repeat(78));
  console.log('ESTATE RULE — would flip YARD → ESTATE (conservative)');
  console.log('-'.repeat(78));
  console.log(`  Total candidates that WOULD flip: ${estateFlips.length}`);
  printTally('Breakdown by current saleType', tallyBy(estateFlips, (r) => r.saleType));
  printTally('Breakdown by sourceName', tallyBy(estateFlips, (r) => r.sourceName ?? '(null)'));

  console.log('\n  Representative titles that WOULD flip (up to 30):');
  estateFlips.slice(0, 30).forEach((r) =>
    console.log(`    [${r.saleType} | ${r.sourceName ?? 'null'}] ${r.title}`),
  );

  console.log(
    `\n  Borderline / EXCLUDED rows (title has 'estate sale', NOT already ESTATE, rule leaves alone): ${estateExcluded.length}`,
  );
  printTally('  Excluded breakdown by current saleType', tallyBy(estateExcluded, (r) => r.saleType));
  printTally('  Excluded breakdown by sourceName', tallyBy(estateExcluded, (r) => r.sourceName ?? '(null)'));
  console.log('\n  Sample EXCLUDED titles (audit for false-negatives — up to 20):');
  estateExcluded.slice(0, 20).forEach((r) =>
    console.log(`    [${r.saleType} | ${r.sourceName ?? 'null'}] ${r.title}`),
  );

  // ---------- APPLY (double-gated; intentionally hard to trigger) ----------
  if (!APPLY) {
    console.log('\n' + '='.repeat(78));
    console.log('DRY-RUN complete. No data was written. Re-run with --apply (and');
    console.log('RECLASSIFY_CONFIRM_APPLY=YES) only after a human reviews the report above.');
    console.log('='.repeat(78));
    return;
  }

  if (APPLY && !APPLY_CONFIRMED) {
    console.error(
      '\n[ABORT] --apply was passed but RECLASSIFY_CONFIRM_APPLY=YES is not set. ' +
        'Refusing to mutate data. No writes performed.',
    );
    process.exitCode = 1;
    return;
  }

  // Reaching here requires --apply AND RECLASSIFY_CONFIRM_APPLY=YES (human intent).
  console.log('\n[APPLY] Mutating ' + (auctionFlips.length + estateFlips.length) + ' rows...');
  let updated = 0;
  for (const r of auctionFlips) {
    await prisma.sale.update({ where: { id: r.id }, data: { saleType: 'AUCTION' } });
    updated++;
  }
  for (const r of estateFlips) {
    await prisma.sale.update({ where: { id: r.id }, data: { saleType: 'ESTATE' } });
    updated++;
  }
  console.log(`[APPLY] Done. ${updated} rows updated.`);
}

main()
  .catch((err) => {
    console.error('Fatal:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
