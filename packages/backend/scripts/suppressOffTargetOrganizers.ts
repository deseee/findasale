#!/usr/bin/env node

/**
 * ADR-075: Suppress Off-Target Organizers
 *
 * Two-pass suppression script:
 *
 * PASS 1 — Category-based (fast):
 *   Suppresses organizers where businessCategory is NOT NULL and NOT IN the valid allowlist.
 *   (Null = came from EstateSales.NET or other legit sources that don't assign a category.)
 *
 * PASS 2 — Name-based (catches existing junk):
 *   Suppresses organizers where businessName contains any BUSINESS_NAME_BLOCKLIST keyword.
 *   This is needed because the Google Places scraper hardcodes a valid category from the
 *   query config — so even a Hilton hotel found via a "thrift store" search gets
 *   businessCategory = 'THRIFT_STORE'. Category filtering can't catch it; name matching can.
 *
 * Both passes:
 *   - Only touch unclaimed, unmanaged listings (isClaimed=false, isUnmanagedListing=true)
 *   - Never suppress already-suppressed organizers (suppressOutreach=false gate)
 *
 * Usage:
 *   DATABASE_URL=... npx ts-node scripts/suppressOffTargetOrganizers.ts
 *   (dry run — shows counts, makes no changes)
 *
 *   DATABASE_URL=... CONFIRM=true npx ts-node scripts/suppressOffTargetOrganizers.ts
 *   (executes the suppression)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const VALID_CATEGORIES = [
  'ESTATE_SALE_CO',
  'AUCTION_HOUSE',
  'ANTIQUE_MALL',
  'ANTIQUE_DEALER',
  'CONSIGNMENT',
  'THRIFT_STORE',
  'FLEA_MARKET',
  'VINTAGE',
  'LIQUIDATION',
  'USED_FURNITURE',
  'PAWN_SHOP',
  'USED_BOOKSTORE',
  'RECORD_STORE',
  'USED_ELECTRONICS',
  'COIN_DEALER',
  'RESALE_SHOP',
  'USED_SPORTING_GOODS',
  'JEWELRY_RESALE',
];

/**
 * Business name keywords that indicate a non-target business.
 * Mirrors BUSINESS_NAME_BLOCKLIST in googlePlaces.ts — keep in sync.
 */
const BUSINESS_NAME_BLOCKLIST = [
  // Hospitality/lodging
  'hotel', 'motel', 'hilton', 'hyatt', 'marriott', 'westin', 'sheraton', 'hampton inn',
  'holiday inn', 'doubletree', 'embassy suites', 'radisson', 'best western', 'days inn',
  'super 8', 'la quinta', 'comfort inn', 'extended stay',

  // Automotive
  'tire shop', 'tire store', 'auto parts', 'muffler', 'oil change', 'car wash',
  'car dealership', 'auto sale', 'motor company', 'body shop', 'transmission',
  'brake shop', 'exhaust shop', 'rim shop',

  // Food/restaurant
  'restaurant', 'burger', 'pizza', 'taco', "subway", "mcdonald's", "wendy's",
  'chick-fil-a', 'starbucks', 'coffee shop', 'diner', 'fast food', 'donut',
  'bar & grill', 'sports bar', 'pizza restaurant',

  // Personal services
  'barber shop', 'hair salon', 'nail salon', 'day spa', 'nail spa', 'massage spa',
  'spa & salon', 'massage', 'tattoo parlor', 'dry cleaner', 'laundromat', 'nail bar',

  // Government/institutional/chains
  'mta', 'metro transit', 'usps', 'post office', 'workforce solutions', 'ecoatm',
  'dollar general', 'dollar tree', 'family dollar', 'big lots', 'ross store',
  'burlington', 'marshalls', 'tj maxx', 'target', 'walmart', 'costco', "sam's club",
  'cvs', 'walgreens', 'rite aid', 'duane reade', 'petco', 'petsmart',
  "dick's sporting goods", 'academy sports', 'spirit halloween', 'columbia sportswear',
  'adidas', 'nike store', "victoria's secret", 'bath & body', "claire's", 'yankee candle',

  // Construction/trades
  'roofing', 'plumbing', 'electrician', 'hvac', 'contractor', 'construction',
  'landscaping', 'lawn care', 'pest control', 'painting company',

  // Medical
  'urgent care', 'clinic', 'hospital', 'dental', 'optometry', 'vision center',
  'chiropractic', 'physical therapy', 'pharmacy',

  // Real estate (different from estate sale companies)
  'real estate group', 'realty', 'realtor', 'property management',
];

async function main() {
  const CONFIRM = (process.env.CONFIRM ?? 'false') === 'true';

  console.log('[Suppress] Starting off-target organizer suppression...\n');
  console.log('[Suppress] PASS 1: Category-based suppression');
  console.log('[Suppress] PASS 2: Business name-based suppression (catches existing junk)\n');

  // ─── PASS 1: Category-based ────────────────────────────────────────────────

  const nullCount = await prisma.organizer.count({
    where: {
      isClaimed: false,
      isUnmanagedListing: true,
      suppressOutreach: false,
      businessCategory: null,
    },
  });

  const offTargetCategoryCount = await prisma.organizer.count({
    where: {
      isClaimed: false,
      isUnmanagedListing: true,
      suppressOutreach: false,
      businessCategory: {
        not: null,
        notIn: VALID_CATEGORIES,
      },
    },
  });

  console.log(`[Pass 1] Null category (skipping — likely EstateSales.NET/legit): ${nullCount}`);
  console.log(`[Pass 1] Explicitly wrong category (will suppress): ${offTargetCategoryCount}\n`);

  // ─── PASS 2: Name-based ────────────────────────────────────────────────────

  console.log('[Pass 2] Scanning for blocklisted business names...');

  // Fetch IDs of all unsuppressed, unclaimed, unmanaged organizers (with or without valid category)
  // Then filter in JS using the blocklist — avoids N+1 and works without raw SQL.
  const candidates = await prisma.organizer.findMany({
    where: {
      isClaimed: false,
      isUnmanagedListing: true,
      suppressOutreach: false,
    },
    select: {
      id: true,
      businessName: true,
    },
  });

  const nameMatchIds: string[] = [];
  const nameMatchExamples: string[] = [];

  for (const org of candidates) {
    if (!org.businessName) continue;
    const nameLower = org.businessName.toLowerCase();
    const matched = BUSINESS_NAME_BLOCKLIST.find((keyword) => nameLower.includes(keyword));
    if (matched) {
      // Exempt auction+realty combos — "Auction & Realty" firms are a real segment of our market
      const REALTY_KEYWORDS = ['realty', 'realtor', 'real estate group'];
      if (REALTY_KEYWORDS.includes(matched) && nameLower.includes('auction')) continue;

      nameMatchIds.push(org.id);
      if (nameMatchExamples.length < 20) {
        nameMatchExamples.push(`  "${org.businessName}" (matched: "${matched}")`);
      }
    }
  }

  console.log(`[Pass 2] Name-matched off-target organizers: ${nameMatchIds.length}`);
  if (nameMatchExamples.length > 0) {
    console.log('[Pass 2] Examples (up to 20):');
    nameMatchExamples.forEach((ex) => console.log(ex));
  }
  console.log();

  const totalToSuppress = offTargetCategoryCount + nameMatchIds.length;

  if (totalToSuppress === 0) {
    console.log('[Suppress] Nothing to suppress across both passes. Exiting.');
    await prisma.$disconnect();
    return;
  }

  console.log(`[Suppress] TOTAL to suppress: ${totalToSuppress} organizers`);
  console.log(`           Pass 1 (wrong category): ${offTargetCategoryCount}`);
  console.log(`           Pass 2 (blocklisted name): ${nameMatchIds.length}\n`);

  if (!CONFIRM) {
    console.log('[Suppress] DRY RUN ONLY — no changes made.');
    console.log('[Suppress] To execute, run:');
    console.log('[Suppress]   DATABASE_URL=... CONFIRM=true npx ts-node scripts/suppressOffTargetOrganizers.ts\n');
    await prisma.$disconnect();
    return;
  }

  // ─── Execute Pass 1 ───────────────────────────────────────────────────────

  if (offTargetCategoryCount > 0) {
    const r1 = await prisma.organizer.updateMany({
      where: {
        isClaimed: false,
        isUnmanagedListing: true,
        suppressOutreach: false,
        businessCategory: {
          not: null,
          notIn: VALID_CATEGORIES,
        },
      },
      data: { suppressOutreach: true },
    });
    console.log(`[Pass 1] Suppressed ${r1.count} organizers with wrong category.`);
  }

  // ─── Execute Pass 2 ───────────────────────────────────────────────────────

  if (nameMatchIds.length > 0) {
    const r2 = await prisma.organizer.updateMany({
      where: {
        id: { in: nameMatchIds },
      },
      data: { suppressOutreach: true },
    });
    console.log(`[Pass 2] Suppressed ${r2.count} organizers with blocklisted names.`);
  }

  console.log(`\n[Suppress] DONE. ${totalToSuppress} organizers suppressed total.`);
  console.log(`[Suppress] These organizers will no longer receive claim or outreach emails.`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[Suppress] Error:', err);
  process.exit(1);
});
