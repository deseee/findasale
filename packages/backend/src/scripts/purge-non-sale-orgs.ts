/**
 * One-time migration: purge off-target organizers from Phase 2 licensing scrapes.
 *
 * Background: Phase 2 licensing scrapers pulled ~37k organizers from state auction
 * license databases, including non-secondary-sale businesses (delis, auto shops, etc.).
 * This script soft-deletes off-target records by setting directoryStatus = 'CLOSED'.
 *
 * Safety:
 * - Soft delete only — directoryStatus set to 'CLOSED', never hard delete
 * - --dry-run flag previews changes without writing
 * - Records with businessCategory already in VALID_CATEGORIES are always kept
 * - Records with isClaimed=true are always kept (active FindA.Sale organizers)
 *
 * Usage:
 *   npx ts-node src/scripts/purge-non-sale-orgs.ts --dry-run
 *   npx ts-node src/scripts/purge-non-sale-orgs.ts
 *
 * Environment: DATABASE_URL must point to Railway DB (not localhost).
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Allowed business categories (from ADR-075 VALID_CATEGORIES in index.ts).
 * Organizers with an explicit businessCategory in this set are always kept.
 */
const VALID_CATEGORIES = new Set([
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
]);

/**
 * Keywords in businessName that indicate a secondary-sale business.
 * Case-insensitive. All-lowercase here.
 */
const KEEP_KEYWORDS = [
  'estate sale',
  'estate sales',
  'estate auction',
  'estate auctions',
  'yard sale',
  'yard sales',
  'garage sale',
  'garage sales',
  'auction',
  'auctioneer',
  'auctioneers',
  'consignment',
  'thrift',
  'antique',
  'antiques',
  'flea market',
  'resale',
  're-sale',
  'vintage',
  'liquidat',
  'used furniture',
  'secondhand',
  'second hand',
  'second-hand',
  'collectible',
  'collectibles',
  'pawn',
  'used goods',
  'rummage',
  'surplus',
  'salvage',
  'estate service',
  'estate services',
  'tag sale',
  'tag sales',
  'moving sale',
  'downsizing',
  'buyout',
  'buy out',
  'estate buyer',
  'estate buyers',
];

/**
 * Source name patterns that identify a Phase 2 licensing scraper record.
 * Licensing scrapers use names like "AlabamaLicensing", "TexasPhase2", etc.
 */
function isLicensingSource(sourcesJson: unknown): boolean {
  if (!sourcesJson || !Array.isArray(sourcesJson)) return false;
  return sourcesJson.some((s: any) => {
    const name: string = s?.sourceName ?? '';
    return name.includes('Licensing') || name.includes('Phase2') || name.toLowerCase().includes('licensing');
  });
}

/**
 * Returns true if businessName contains any secondary-sale keyword.
 */
function hasKeepKeyword(businessName: string): boolean {
  const lower = businessName.toLowerCase();
  return KEEP_KEYWORDS.some((kw) => lower.includes(kw));
}

async function main(): Promise<void> {
  console.log(`[purge-non-sale-orgs] Starting — DRY_RUN=${DRY_RUN}`);
  console.log('[purge-non-sale-orgs] Fetching unmanaged organizers...');

  const PAGE_SIZE = 500;
  let offset = 0;
  let totalScanned = 0;
  let keepCount = 0;
  let skippedClaimed = 0;
  const purgeIds: string[] = [];

  while (true) {
    const batch = await prisma.organizer.findMany({
      where: {
        isUnmanagedListing: true,
        directoryStatus: { not: 'CLOSED' },
      },
      select: {
        id: true,
        businessName: true,
        businessCategory: true,
        isClaimed: true,
        directoryStatus: true,
        sourcesJson: true,
      },
      skip: offset,
      take: PAGE_SIZE,
      orderBy: { id: 'asc' },
    });

    if (batch.length === 0) break;
    offset += batch.length;
    totalScanned += batch.length;

    for (const org of batch) {
      // Safety: never purge claimed organizers
      if (org.isClaimed) {
        skippedClaimed++;
        continue;
      }

      // Only process records from licensing/Phase2 sources
      if (!isLicensingSource(org.sourcesJson)) {
        keepCount++;
        continue;
      }

      // If businessCategory is explicitly in the allowlist, keep it
      if (org.businessCategory && VALID_CATEGORIES.has(org.businessCategory)) {
        keepCount++;
        continue;
      }

      // If businessName contains secondary-sale keywords, keep it
      if (hasKeepKeyword(org.businessName)) {
        keepCount++;
        continue;
      }

      // Off-target — mark for purge
      purgeIds.push(org.id);
    }

    process.stdout.write(`\r[purge-non-sale-orgs] Scanned ${totalScanned} records...`);
  }

  const purgeCount = purgeIds.length;

  console.log(`\n[purge-non-sale-orgs] Scan complete:`);
  console.log(`  Total scanned:      ${totalScanned}`);
  console.log(`  Keep (valid):       ${keepCount}`);
  console.log(`  Skip (claimed):     ${skippedClaimed}`);
  console.log(`  TO PURGE:           ${purgeCount}`);

  if (purgeCount === 0) {
    console.log('[purge-non-sale-orgs] Nothing to purge — done.');
    return;
  }

  if (DRY_RUN) {
    console.log(`[purge-non-sale-orgs] DRY RUN — would soft-delete ${purgeCount} organizers.`);
    console.log('[purge-non-sale-orgs] Sample purge targets (first 20):');
    const sampleIds = purgeIds.slice(0, 20);
    const samples = await prisma.organizer.findMany({
      where: { id: { in: sampleIds } },
      select: { id: true, businessName: true, businessCategory: true, sourcesJson: true },
    });
    samples.forEach((s) => {
      const sources = Array.isArray(s.sourcesJson)
        ? (s.sourcesJson as any[]).map((x: any) => x.sourceName).join(', ')
        : 'unknown';
      console.log(`  - ${s.businessName} | cat=${s.businessCategory ?? 'null'} | sources=${sources}`);
    });
    console.log('[purge-non-sale-orgs] Re-run without --dry-run to apply.');
    return;
  }

  // Apply soft-delete in batches of 100
  console.log(`[purge-non-sale-orgs] Applying soft-delete to ${purgeCount} organizers...`);
  const WRITE_BATCH = 100;
  let written = 0;

  for (let i = 0; i < purgeIds.length; i += WRITE_BATCH) {
    const chunk = purgeIds.slice(i, i + WRITE_BATCH);
    await prisma.organizer.updateMany({
      where: { id: { in: chunk } },
      data: {
        directoryStatus: 'CLOSED',
        directoryStatusReason: 'purge-non-sale-orgs: off-target business category from licensing scrape',
        directoryStatusSetAt: new Date(),
      },
    });
    written += chunk.length;
    process.stdout.write(`\r[purge-non-sale-orgs] Written ${written}/${purgeCount}...`);
  }

  console.log(`\n[purge-non-sale-orgs] Done — ${purgeCount} organizers soft-deleted (directoryStatus=CLOSED).`);
}

main()
  .catch((err) => {
    console.error('[purge-non-sale-orgs] Fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
