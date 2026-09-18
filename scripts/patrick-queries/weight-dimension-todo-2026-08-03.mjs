// Run from packages/database with DATABASE_URL set to the Railway production URL.
// Purpose: give Patrick a physical-world checklist for this afternoon's weighing/measuring
// session on the Artifact (production) organizer account, plus the organizer's ACTUAL
// live eBay weight-tier cutoffs (these are per-organizer config, not a hardcoded constant --
// so "up to 2 pounds" can only be confirmed by reading this organizer's real saved tiers).
import { PrismaClient } from '../../packages/database/node_modules/.prisma/client/index.js';
const prisma = new PrismaClient();

const ARTIFACT_ORGANIZER_ID = 'cmnxueoas0005tfv8brnc0kky';

// 1. Real weight-tier cutoffs for this organizer (answers the "up to 2 lbs?" question)
const mapping = await prisma.ebayPolicyMapping.findUnique({
  where: { organizerId: ARTIFACT_ORGANIZER_ID },
  select: { weightTierMappings: true, shippingMode: true },
});
console.log('=== LIVE WEIGHT-TIER CONFIG (Artifact organizer) ===');
console.log(`shippingMode: ${mapping?.shippingMode ?? 'NOT SET'}`);
const tiers = Array.isArray(mapping?.weightTierMappings) ? mapping.weightTierMappings : [];
if (tiers.length === 0) {
  console.log('No weightTierMappings saved for this organizer (empty array) -- shippingMode is likely CALCULATED, meaning eBay computes real-time rates per item weight/dims rather than using flat tiers. There is no single "up to N lbs" cutoff in that mode.');
} else {
  const sorted = [...tiers].sort((a, b) => (a.maxOz ?? 0) - (b.maxOz ?? 0));
  for (const t of sorted) {
    const lbs = (t.maxOz / 16).toFixed(2);
    console.log(`  up to ${t.maxOz}oz (${lbs} lbs) -> "${t.policyName}" (${t.policyId})`);
  }
  const maxTier = sorted[sorted.length - 1];
  console.log(`\nHighest flat-tier cutoff: ${maxTier.maxOz}oz = ${(maxTier.maxOz / 16).toFixed(2)} lbs. Items heavier than this fall through to FVF-flat or calculated shipping (see ebayShippingResolver.ts gap-guard logic).`);
}

// 2. Physical checklist: items that need real-world weighing/measuring.
// Excludes LOCAL_PICKUP_ONLY (never ships, weight is irrelevant) and items already
// organizer-confirmed. Includes: (a) zero weight data at all, (b) has an estimate but
// it's AI/KEYWORD sourced (lower confidence, never physically confirmed).
const items = await prisma.item.findMany({
  where: {
    sale: { organizerId: ARTIFACT_ORGANIZER_ID },
    status: 'AVAILABLE',
    isActive: true,
    deletedAt: null,
    packageConfirmedByOrganizer: false,
    OR: [
      { ebayShippingOverride: null },
      { ebayShippingOverride: { not: 'LOCAL_PICKUP_ONLY' } },
    ],
  },
  select: {
    id: true, title: true,
    packageWeightOz: true, packageLengthIn: true, packageWidthIn: true, packageHeightIn: true,
    packageEstimateSource: true, packageEstimateConfidence: true,
    aiPackageWeightOz: true, aiPackageConfidence: true,
    ebayListingId: true,
  },
  orderBy: [{ packageWeightOz: 'asc' }, { packageEstimateConfidence: 'asc' }],
});

const noDataAtAll = items.filter(i => i.packageWeightOz == null && i.aiPackageWeightOz == null);
const hasEstimateOnly = items.filter(i => !(i.packageWeightOz == null && i.aiPackageWeightOz == null));

console.log(`\n=== PHYSICAL WEIGH/MEASURE CHECKLIST (Artifact, AVAILABLE, not local-pickup-only, not yet organizer-confirmed) ===`);
console.log(`Total needing attention: ${items.length}  |  Zero data at all: ${noDataAtAll.length}  |  Have an unconfirmed estimate: ${hasEstimateOnly.length}\n`);

console.log('--- PRIORITY 1: no weight/dimension data at all ---');
for (const it of noDataAtAll) {
  console.log(`[ ] ${it.title}  (id=${it.id}${it.ebayListingId ? ', LIVE ON EBAY' : ''})`);
}

console.log('\n--- PRIORITY 2: has an estimate, never physically confirmed ---');
for (const it of hasEstimateOnly) {
  const wOz = it.packageWeightOz ?? it.aiPackageWeightOz;
  const dims = (it.packageLengthIn && it.packageWidthIn && it.packageHeightIn)
    ? `${it.packageLengthIn}x${it.packageWidthIn}x${it.packageHeightIn}in` : 'no dims';
  console.log(`[ ] ${it.title}  est=${wOz}oz (${(wOz/16).toFixed(1)}lb) ${dims} source=${it.packageEstimateSource ?? 'AI'} conf=${it.packageEstimateConfidence ?? it.aiPackageConfidence ?? '?'}  (id=${it.id}${it.ebayListingId ? ', LIVE ON EBAY' : ''})`);
}

await prisma.$disconnect();
