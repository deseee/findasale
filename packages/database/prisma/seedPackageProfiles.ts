/**
 * seedPackageProfiles.ts — idempotent seed for the global PackageProfile and
 * EbayCategoryFee reference tables used by the calculated-shipping + net engine.
 *
 * Safe to run against production: it does NOT wipe any data. It upserts the
 * EbayCategoryFee default + overrides by ebayCategoryId, and only inserts
 * PackageProfile rows when the table is empty (so re-runs don't duplicate).
 *
 * Run:  npx ts-node prisma/seedPackageProfiles.ts
 *   or: npx prisma db execute is NOT needed — this uses the Prisma client.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── EbayCategoryFee: published 2026 rates ───────────────────────────────────
// Default 13.60% + $0.40 per order. Media/books category override 15.30%.
// ebayCategoryId values are eBay top-level/representative leaf IDs.
const CATEGORY_FEES: Array<{
  ebayCategoryId: string | null;
  categoryLabel: string | null;
  fvfPercent: number;
  perOrderFeeCents: number;
  notes?: string;
}> = [
  { ebayCategoryId: null, categoryLabel: 'Default (most categories)', fvfPercent: 0.136, perOrderFeeCents: 40, notes: 'eBay 2026 published default final value fee' },
  { ebayCategoryId: '267', categoryLabel: 'Books & Magazines', fvfPercent: 0.153, perOrderFeeCents: 40, notes: 'Media rate (Books)' },
  { ebayCategoryId: '11233', categoryLabel: 'Music (CDs, Vinyl)', fvfPercent: 0.153, perOrderFeeCents: 40, notes: 'Media rate (Music)' },
  { ebayCategoryId: '11232', categoryLabel: 'Movies & TV (DVD, Blu-ray)', fvfPercent: 0.153, perOrderFeeCents: 40, notes: 'Media rate (Movies)' },
  { ebayCategoryId: '1249', categoryLabel: 'Video Games & Consoles', fvfPercent: 0.153, perOrderFeeCents: 40, notes: 'Media rate (Video Games)' },
];

// ── PackageProfile: common secondary-sale item types (PACKED weights/dims) ──
// packageType uses eBay enums: PACKAGE_THICK_ENVELOPE | MAILING_BOX | LARGE_PACKAGE | USPS_FLAT_RATE_ENVELOPE
type Profile = {
  category?: string;
  keyword?: string;
  weightOz: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  packageType: string;
  confidence: number;
};

const PROFILES: Profile[] = [
  // Glassware / ceramics (well-padded boxes)
  { category: 'Glassware', keyword: 'glass', weightOz: 28, lengthIn: 10, widthIn: 8, heightIn: 8, packageType: 'MAILING_BOX', confidence: 0.6 },
  { keyword: 'mug', weightOz: 20, lengthIn: 8, widthIn: 6, heightIn: 5, packageType: 'MAILING_BOX', confidence: 0.65 },
  { keyword: 'vase', weightOz: 40, lengthIn: 12, widthIn: 10, heightIn: 10, packageType: 'MAILING_BOX', confidence: 0.55 },
  { keyword: 'plate', weightOz: 24, lengthIn: 12, widthIn: 12, heightIn: 4, packageType: 'MAILING_BOX', confidence: 0.6 },
  { keyword: 'pyrex', weightOz: 48, lengthIn: 12, widthIn: 10, heightIn: 8, packageType: 'MAILING_BOX', confidence: 0.65 },
  { keyword: 'figurine', weightOz: 18, lengthIn: 8, widthIn: 6, heightIn: 6, packageType: 'MAILING_BOX', confidence: 0.55 },

  // Books / media
  { category: 'Books', keyword: 'book', weightOz: 20, lengthIn: 10, widthIn: 8, heightIn: 2, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.7 },
  { keyword: 'hardcover', weightOz: 32, lengthIn: 11, widthIn: 9, heightIn: 2, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.65 },
  { keyword: 'vinyl', weightOz: 12, lengthIn: 13, widthIn: 13, heightIn: 1, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.7 },
  { keyword: 'record', weightOz: 12, lengthIn: 13, widthIn: 13, heightIn: 1, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.65 },
  { keyword: 'dvd', weightOz: 6, lengthIn: 8, widthIn: 6, heightIn: 1, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.75 },
  { keyword: 'cd', weightOz: 4, lengthIn: 6, widthIn: 6, heightIn: 1, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.7 },

  // Small electronics
  { category: 'Electronics', keyword: 'camera', weightOz: 36, lengthIn: 10, widthIn: 8, heightIn: 6, packageType: 'MAILING_BOX', confidence: 0.6 },
  { keyword: 'radio', weightOz: 40, lengthIn: 12, widthIn: 8, heightIn: 6, packageType: 'MAILING_BOX', confidence: 0.55 },
  { keyword: 'speaker', weightOz: 48, lengthIn: 12, widthIn: 10, heightIn: 9, packageType: 'MAILING_BOX', confidence: 0.55 },
  { keyword: 'headphones', weightOz: 12, lengthIn: 9, widthIn: 7, heightIn: 4, packageType: 'MAILING_BOX', confidence: 0.65 },
  { keyword: 'console', weightOz: 80, lengthIn: 16, widthIn: 12, heightIn: 6, packageType: 'MAILING_BOX', confidence: 0.55 },
  { keyword: 'controller', weightOz: 10, lengthIn: 8, widthIn: 6, heightIn: 4, packageType: 'MAILING_BOX', confidence: 0.65 },

  // Jewelry / small valuables
  { category: 'Jewelry', keyword: 'ring', weightOz: 3, lengthIn: 5, widthIn: 4, heightIn: 2, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.75 },
  { keyword: 'necklace', weightOz: 4, lengthIn: 6, widthIn: 5, heightIn: 2, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.7 },
  { keyword: 'watch', weightOz: 8, lengthIn: 6, widthIn: 5, heightIn: 3, packageType: 'MAILING_BOX', confidence: 0.65 },
  { keyword: 'brooch', weightOz: 3, lengthIn: 5, widthIn: 4, heightIn: 2, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.7 },

  // Clothing / textiles
  { category: 'Clothing', keyword: 'shirt', weightOz: 10, lengthIn: 12, widthIn: 9, heightIn: 3, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.65 },
  { keyword: 'jacket', weightOz: 32, lengthIn: 14, widthIn: 11, heightIn: 5, packageType: 'MAILING_BOX', confidence: 0.6 },
  { keyword: 'dress', weightOz: 18, lengthIn: 13, widthIn: 10, heightIn: 4, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.6 },
  { keyword: 'coat', weightOz: 48, lengthIn: 16, widthIn: 12, heightIn: 6, packageType: 'MAILING_BOX', confidence: 0.55 },
  { keyword: 'boots', weightOz: 40, lengthIn: 14, widthIn: 10, heightIn: 6, packageType: 'MAILING_BOX', confidence: 0.6 },
  { category: 'Linens', keyword: 'quilt', weightOz: 56, lengthIn: 16, widthIn: 13, heightIn: 8, packageType: 'MAILING_BOX', confidence: 0.55 },

  // Kitchenware / cookware
  { category: 'Kitchenware', keyword: 'skillet', weightOz: 80, lengthIn: 14, widthIn: 12, heightIn: 4, packageType: 'MAILING_BOX', confidence: 0.65 },
  { keyword: 'cast iron', weightOz: 96, lengthIn: 14, widthIn: 12, heightIn: 5, packageType: 'MAILING_BOX', confidence: 0.65 },
  { keyword: 'pot', weightOz: 64, lengthIn: 13, widthIn: 12, heightIn: 9, packageType: 'MAILING_BOX', confidence: 0.55 },
  { keyword: 'mixer', weightOz: 112, lengthIn: 16, widthIn: 13, heightIn: 12, packageType: 'LARGE_PACKAGE', confidence: 0.55 },
  { keyword: 'utensil', weightOz: 8, lengthIn: 10, widthIn: 5, heightIn: 3, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.6 },
  { keyword: 'bowl', weightOz: 24, lengthIn: 11, widthIn: 11, heightIn: 6, packageType: 'MAILING_BOX', confidence: 0.6 },

  // Tools
  { category: 'Tools', keyword: 'drill', weightOz: 64, lengthIn: 13, widthIn: 10, heightIn: 6, packageType: 'MAILING_BOX', confidence: 0.6 },
  { keyword: 'wrench', weightOz: 24, lengthIn: 12, widthIn: 5, heightIn: 3, packageType: 'MAILING_BOX', confidence: 0.6 },
  { keyword: 'hammer', weightOz: 28, lengthIn: 14, widthIn: 6, heightIn: 3, packageType: 'MAILING_BOX', confidence: 0.6 },
  { keyword: 'saw', weightOz: 48, lengthIn: 26, widthIn: 8, heightIn: 4, packageType: 'LARGE_PACKAGE', confidence: 0.5 },
  { keyword: 'tool set', weightOz: 96, lengthIn: 16, widthIn: 12, heightIn: 6, packageType: 'MAILING_BOX', confidence: 0.55 },
  { keyword: 'pump', weightOz: 80, lengthIn: 14, widthIn: 10, heightIn: 8, packageType: 'MAILING_BOX', confidence: 0.5 },

  // Art / decor
  { category: 'Art', keyword: 'framed', weightOz: 48, lengthIn: 24, widthIn: 18, heightIn: 4, packageType: 'LARGE_PACKAGE', confidence: 0.5 },
  { keyword: 'painting', weightOz: 56, lengthIn: 26, widthIn: 20, heightIn: 4, packageType: 'LARGE_PACKAGE', confidence: 0.5 },
  { keyword: 'print', weightOz: 12, lengthIn: 20, widthIn: 4, heightIn: 4, packageType: 'MAILING_TUBE', confidence: 0.55 },
  { keyword: 'mirror', weightOz: 64, lengthIn: 24, widthIn: 18, heightIn: 4, packageType: 'LARGE_PACKAGE', confidence: 0.45 },
  { keyword: 'clock', weightOz: 40, lengthIn: 13, widthIn: 11, heightIn: 7, packageType: 'MAILING_BOX', confidence: 0.55 },

  // Lamps / lighting / small appliances
  { keyword: 'lamp', weightOz: 80, lengthIn: 16, widthIn: 12, heightIn: 12, packageType: 'LARGE_PACKAGE', confidence: 0.5 },
  { keyword: 'lampshade', weightOz: 20, lengthIn: 16, widthIn: 16, heightIn: 12, packageType: 'LARGE_PACKAGE', confidence: 0.5 },
  { keyword: 'toaster', weightOz: 64, lengthIn: 13, widthIn: 9, heightIn: 9, packageType: 'MAILING_BOX', confidence: 0.6 },
  { keyword: 'blender', weightOz: 80, lengthIn: 14, widthIn: 10, heightIn: 12, packageType: 'LARGE_PACKAGE', confidence: 0.55 },
  { keyword: 'fan', weightOz: 96, lengthIn: 18, widthIn: 14, heightIn: 8, packageType: 'LARGE_PACKAGE', confidence: 0.5 },

  // Toys / games / collectibles
  { category: 'Toys', keyword: 'toy', weightOz: 16, lengthIn: 10, widthIn: 8, heightIn: 6, packageType: 'MAILING_BOX', confidence: 0.55 },
  { keyword: 'doll', weightOz: 20, lengthIn: 12, widthIn: 8, heightIn: 6, packageType: 'MAILING_BOX', confidence: 0.55 },
  { keyword: 'puzzle', weightOz: 24, lengthIn: 12, widthIn: 10, heightIn: 3, packageType: 'MAILING_BOX', confidence: 0.6 },
  { keyword: 'board game', weightOz: 32, lengthIn: 12, widthIn: 10, heightIn: 3, packageType: 'MAILING_BOX', confidence: 0.6 },
  { category: 'Collectibles', keyword: 'coin', weightOz: 4, lengthIn: 6, widthIn: 5, heightIn: 2, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.65 },
  { keyword: 'card', weightOz: 3, lengthIn: 6, widthIn: 4, heightIn: 1, packageType: 'PACKAGE_THICK_ENVELOPE', confidence: 0.7 },

  // Sports
  { category: 'Sports', keyword: 'glove', weightOz: 16, lengthIn: 11, widthIn: 9, heightIn: 5, packageType: 'MAILING_BOX', confidence: 0.6 },
  { keyword: 'racket', weightOz: 24, lengthIn: 28, widthIn: 12, heightIn: 3, packageType: 'LARGE_PACKAGE', confidence: 0.5 },

  // Furniture small (most furniture is local-pickup, but small pieces ship)
  { keyword: 'stool', weightOz: 160, lengthIn: 20, widthIn: 16, heightIn: 16, packageType: 'LARGE_PACKAGE', confidence: 0.45 },
  { keyword: 'chair', weightOz: 240, lengthIn: 24, widthIn: 22, heightIn: 36, packageType: 'LARGE_PACKAGE', confidence: 0.4 },
];

async function main() {
  console.log('🌱 Seeding EbayCategoryFee...');
  for (const fee of CATEGORY_FEES) {
    if (fee.ebayCategoryId === null) {
      // Default row — find existing null row, update or create.
      const existing = await prisma.ebayCategoryFee.findFirst({ where: { ebayCategoryId: null } });
      if (existing) {
        await prisma.ebayCategoryFee.update({
          where: { id: existing.id },
          data: { fvfPercent: fee.fvfPercent, perOrderFeeCents: fee.perOrderFeeCents, categoryLabel: fee.categoryLabel, notes: fee.notes, source: 'PUBLISHED_RATE' },
        });
      } else {
        await prisma.ebayCategoryFee.create({
          data: { ebayCategoryId: null, categoryLabel: fee.categoryLabel, fvfPercent: fee.fvfPercent, perOrderFeeCents: fee.perOrderFeeCents, notes: fee.notes, source: 'PUBLISHED_RATE' },
        });
      }
    } else {
      await prisma.ebayCategoryFee.upsert({
        where: { ebayCategoryId: fee.ebayCategoryId },
        update: { fvfPercent: fee.fvfPercent, perOrderFeeCents: fee.perOrderFeeCents, categoryLabel: fee.categoryLabel, notes: fee.notes, source: 'PUBLISHED_RATE' },
        create: { ebayCategoryId: fee.ebayCategoryId, categoryLabel: fee.categoryLabel, fvfPercent: fee.fvfPercent, perOrderFeeCents: fee.perOrderFeeCents, notes: fee.notes, source: 'PUBLISHED_RATE' },
      });
    }
  }
  console.log(`   • ${CATEGORY_FEES.length} category fee rows upserted`);

  console.log('🌱 Seeding PackageProfile...');
  const count = await prisma.packageProfile.count();
  if (count > 0) {
    console.log(`   • PackageProfile already has ${count} rows — skipping insert (idempotent)`);
  } else {
    await prisma.packageProfile.createMany({
      data: PROFILES.map((p) => ({
        category: p.category ?? null,
        keyword: p.keyword ?? null,
        weightOz: p.weightOz,
        lengthIn: p.lengthIn,
        widthIn: p.widthIn,
        heightIn: p.heightIn,
        packageType: p.packageType,
        confidence: p.confidence,
        source: 'SEED',
      })),
    });
    console.log(`   • ${PROFILES.length} package profiles inserted`);
  }
  console.log('✅ Done.');
}

main()
  .catch((e) => {
    console.error('❌ seedPackageProfiles error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
