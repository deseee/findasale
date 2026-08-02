// One-off diagnostic for the Architect's 2026-08-01 shipping-architecture review
// (Patrick's "should we require full dimensions before allowing shipping?" question).
//
// Cannot be run from the Cowork sandbox this session — no network access to Railway
// Postgres (confirmed twice). Run this from Patrick's own machine against the real
// database, per the same pattern as check-stale-shipping-policies-2026-08-01.ts.
//
// What this answers: for each organizer with items still eligible to be pushed to a
// marketplace (AVAILABLE/RESERVED, isActive), what fraction have:
//   - packageWeightOz set (required for eBay's flat-tier/cubic and for FB's weight bucket)
//   - all three of packageLengthIn/packageWidthIn/packageHeightIn set (required for cubic
//     dimensional policies and for eBay calculated shipping)
//   - packageConfirmedByOrganizer true vs. only an AI/keyword estimate
//   - ebayShippingOverride already set to LOCAL_PICKUP_ONLY or DONT_LIST (organizers who
//     already opted out of shipping for that item — excluded from "should be blocked"
//     counts since they're already local-pickup-only by choice)
//
// This directly informs the recommendation in the review doc: if the overwhelming
// majority of active items already have weight+dims, a hard require-dimensions gate is
// low-friction. If a large fraction don't, a hard gate would silently flip a lot of
// existing inventory to local-pickup-only the moment it ships, which is a workflow
// surprise Patrick should see the real number for before deciding.
//
// Read-only. Makes zero writes.
//
// Run from project root:
//   pnpm --filter backend exec tsx scripts/check-item-dimension-completeness-2026-08-01.ts

import { PrismaClient } from '../../database/node_modules/@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const items = await prisma.item.findMany({
    where: {
      isActive: true,
      status: { in: ['AVAILABLE', 'RESERVED'] },
    },
    select: {
      id: true,
      organizerId: true,
      packageWeightOz: true,
      packageLengthIn: true,
      packageWidthIn: true,
      packageHeightIn: true,
      packageConfirmedByOrganizer: true,
      packageEstimateSource: true,
      ebayShippingOverride: true,
      ebayShippingClassification: true,
    },
  });

  type OrgStats = {
    organizerId: string;
    total: number;
    hasWeight: number;
    hasFullDims: number;
    confirmedByOrganizer: number;
    alreadyLocalPickupOrDontList: number;
    wouldBeBlockedByHardDimsGate: number; // no weight AND/OR no full dims, and not already opted out
  };
  const byOrg = new Map<string, OrgStats>();

  let totalItems = 0;
  let totalHasWeight = 0;
  let totalHasFullDims = 0;
  let totalConfirmed = 0;
  let totalAlreadyOptedOut = 0;
  let totalWouldBeBlocked = 0;

  for (const item of items) {
    const orgId = item.organizerId || 'UNKNOWN';
    if (!byOrg.has(orgId)) {
      byOrg.set(orgId, {
        organizerId: orgId,
        total: 0,
        hasWeight: 0,
        hasFullDims: 0,
        confirmedByOrganizer: 0,
        alreadyLocalPickupOrDontList: 0,
        wouldBeBlockedByHardDimsGate: 0,
      });
    }
    const stats = byOrg.get(orgId)!;
    stats.total++;
    totalItems++;

    const hasWeight = item.packageWeightOz != null;
    const hasFullDims =
      item.packageLengthIn != null && item.packageWidthIn != null && item.packageHeightIn != null;
    const alreadyOptedOut =
      item.ebayShippingOverride === 'LOCAL_PICKUP_ONLY' || item.ebayShippingOverride === 'DONT_LIST';

    if (hasWeight) { stats.hasWeight++; totalHasWeight++; }
    if (hasFullDims) { stats.hasFullDims++; totalHasFullDims++; }
    if (item.packageConfirmedByOrganizer) { stats.confirmedByOrganizer++; totalConfirmed++; }
    if (alreadyOptedOut) { stats.alreadyLocalPickupOrDontList++; totalAlreadyOptedOut++; }

    if (!alreadyOptedOut && (!hasWeight || !hasFullDims)) {
      stats.wouldBeBlockedByHardDimsGate++;
      totalWouldBeBlocked++;
    }
  }

  console.log('=== Item dimension/weight completeness — all active organizers ===\n');
  const rows = [...byOrg.values()].sort((a, b) => b.total - a.total);
  for (const r of rows) {
    console.log(
      `organizer=${r.organizerId} total=${r.total} ` +
        `hasWeight=${r.hasWeight} (${((r.hasWeight / r.total) * 100).toFixed(0)}%) ` +
        `hasFullDims=${r.hasFullDims} (${((r.hasFullDims / r.total) * 100).toFixed(0)}%) ` +
        `organizerConfirmed=${r.confirmedByOrganizer} (${((r.confirmedByOrganizer / r.total) * 100).toFixed(0)}%) ` +
        `alreadyOptedOut=${r.alreadyLocalPickupOrDontList} ` +
        `WOULD_BE_BLOCKED_by_hard_dims_gate=${r.wouldBeBlockedByHardDimsGate} ` +
        `(${((r.wouldBeBlockedByHardDimsGate / r.total) * 100).toFixed(0)}%)`
    );
  }

  console.log('\n=== TOTALS ===');
  console.log(`Total active items checked: ${totalItems}`);
  console.log(`Has weight: ${totalHasWeight} (${((totalHasWeight / totalItems) * 100).toFixed(1)}%)`);
  console.log(`Has full L/W/H dims: ${totalHasFullDims} (${((totalHasFullDims / totalItems) * 100).toFixed(1)}%)`);
  console.log(`Organizer-confirmed package details: ${totalConfirmed} (${((totalConfirmed / totalItems) * 100).toFixed(1)}%)`);
  console.log(`Already LOCAL_PICKUP_ONLY or DONT_LIST: ${totalAlreadyOptedOut} (${((totalAlreadyOptedOut / totalItems) * 100).toFixed(1)}%)`);
  console.log(
    `Would be auto-flipped to local-pickup-only by a HARD dims-required gate: ${totalWouldBeBlocked} ` +
      `(${((totalWouldBeBlocked / totalItems) * 100).toFixed(1)}%)`
  );
  console.log(
    '\nInterpretation: the last line is the real workflow-friction number for Patrick\'s ' +
      'require-dimensions proposal. A high percentage means a hard gate would silently drop a lot ' +
      'of existing live/queued inventory to local-pickup-only the moment it\'s enabled — favors a ' +
      'soft warning + grace period over an immediate hard block for EXISTING items (new items can ' +
      'still get a hard gate at entry).'
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
