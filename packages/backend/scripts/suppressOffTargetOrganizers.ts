#!/usr/bin/env node

/**
 * ADR-075: Suppress Off-Target Organizers
 *
 * One-time script to set suppressOutreach = true on all organizers where:
 * - businessCategory IS NULL OR NOT IN (valid allowlist)
 * - AND isClaimed = false (never suppress claimed organizers)
 * - AND isUnmanagedListing = true (only scraped/unverified listings)
 *
 * This prevents off-target businesses (tire shops, hotels, fast food, government, etc.)
 * from receiving claim or outreach emails.
 *
 * Usage:
 *   DATABASE_URL=... npx ts-node scripts/suppressOffTargetOrganizers.ts
 *   (will show dry-run count)
 *
 *   DATABASE_URL=... CONFIRM=true npx ts-node scripts/suppressOffTargetOrganizers.ts
 *   (will execute the update)
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

async function main() {
  const CONFIRM = (process.env.CONFIRM ?? 'false') === 'true';

  console.log('[Suppress] Starting off-target organizer suppression...\n');

  // Dry run: count affected organizers
  // NOTE: Only suppresses organizers with an EXPLICITLY wrong category (not null).
  // Null businessCategory = came from EstateSales.NET or other legitimate sources
  // that don't assign a category — these should remain eligible for outreach.
  console.log('[Suppress] Dry run: counting organizers to suppress...');
  console.log('[Suppress] NOTE: Only targeting explicitly wrong categories (not null).\n');

  const nullCount = await prisma.organizer.count({
    where: {
      isClaimed: false,
      isUnmanagedListing: true,
      suppressOutreach: false,
      businessCategory: null,
    },
  });

  const offTargetCount = await prisma.organizer.count({
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

  console.log(`[Suppress] Null category (skipping — likely EstateSales.NET/legit): ${nullCount}`);
  console.log(`[Suppress] Explicitly wrong category (will suppress): ${offTargetCount}\n`);

  if (offTargetCount === 0) {
    console.log('[Suppress] No organizers to suppress. Exiting.');
    await prisma.$disconnect();
    return;
  }

  if (!CONFIRM) {
    console.log('[Suppress] DRY RUN ONLY — no changes made.');
    console.log(`[Suppress] To suppress the ${offTargetCount} explicitly wrong organizers, run:`);
    console.log(`[Suppress]   DATABASE_URL=... CONFIRM=true npx ts-node scripts/suppressOffTargetOrganizers.ts\n`);
    await prisma.$disconnect();
    return;
  }

  // Execute: suppress only explicitly wrong categories (not null)
  console.log(`[Suppress] EXECUTING: suppressing ${offTargetCount} organizers with wrong category...\n`);

  const result = await prisma.organizer.updateMany({
    where: {
      isClaimed: false,
      isUnmanagedListing: true,
      suppressOutreach: false,
      businessCategory: {
        not: null,
        notIn: VALID_CATEGORIES,
      },
    },
    data: {
      suppressOutreach: true,
    },
  });

  console.log(`[Suppress] SUCCESS: ${result.count} organizers suppressed\n`);
  console.log(`[Suppress] These organizers will no longer receive claim or outreach emails.`);
  console.log(`[Suppress] Category filter: ${VALID_CATEGORIES.join(', ')}\n`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[Suppress] Error:', err);
  process.exit(1);
});
