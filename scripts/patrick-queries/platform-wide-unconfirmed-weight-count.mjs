// Run from packages/database with DATABASE_URL set to the Railway production URL.
// Purpose: the known "unconfirmed-weight eBay backlog" (items live on eBay with
// packageConfirmedByOrganizer: false) has only ever been counted for the Artifact
// organizer. This answers the platform-wide question: which eBay-connected
// organizers -- ALL of them, not just Artifact -- have AVAILABLE items in this
// state, and how many each. Read-only -- makes no writes.
import { PrismaClient } from '../../packages/database/node_modules/.prisma/client/index.js';
const prisma = new PrismaClient();

// 1. Every eBay-connected organizer. EbayConnection.organizerId is @unique (one row
//    per organizer, schema.prisma:611-659) -- a row existing means that organizer has
//    completed eBay OAuth and has (or had) a usable connection. This does not check
//    whether the connection's token is still valid/unexpired -- it answers "connected
//    at all", which is the platform-wide question being asked here.
const connections = await prisma.ebayConnection.findMany({
  select: {
    organizerId: true,
    organizer: { select: { businessName: true } },
  },
});

console.log(`eBay-connected organizers found: ${connections.length}`);

if (connections.length === 0) {
  console.log('No EbayConnection rows found -- nothing to check.');
  await prisma.$disconnect();
  process.exit(0);
}

const orgIds = connections.map((c) => c.organizerId);

// 2. For each connected organizer, count AVAILABLE items that are live on eBay
//    (ebayListingId set) but were published using an unconfirmed weight/shipping
//    estimate (packageConfirmedByOrganizer: false). Uses Item.organizerId, the
//    denormalized field noted in schema.prisma:1154 ("Denormalized from
//    sale.organizerId for library queries") -- same field ebay-offer-vs-listing-gap.mjs
//    uses to scope Item queries to one organizer. NOTE: this field is nullable and
//    documented as denormalized/backfilled rather than a live FK -- if a given item's
//    organizerId ever turns out to be unpopulated where sale.organizerId is not, this
//    count would undercount that organizer. Not verified against production data in
//    this pass (no DB access available) -- flag this to Patrick as a caveat, not a
//    guarantee.
const grouped = await prisma.item.groupBy({
  by: ['organizerId'],
  where: {
    organizerId: { in: orgIds },
    status: 'AVAILABLE',
    isActive: true,
    deletedAt: null,
    ebayListingId: { not: null },
    packageConfirmedByOrganizer: false,
  },
  _count: { _all: true },
});

const countByOrg = new Map(grouped.map((g) => [g.organizerId, g._count._all]));

const rows = connections
  .map((c) => ({
    organizerId: c.organizerId,
    businessName: c.organizer?.businessName ?? '(unknown)',
    count: countByOrg.get(c.organizerId) ?? 0,
  }))
  .sort((a, b) => b.count - a.count);

console.log('\n=== PLATFORM-WIDE UNCONFIRMED-WEIGHT BACKLOG (AVAILABLE items, ebayListingId set, packageConfirmedByOrganizer: false) ===');
console.log('count  organizer (organizerId)');
let grandTotal = 0;
for (const r of rows) {
  grandTotal += r.count;
  console.log(`${String(r.count).padStart(5)}  ${r.businessName}  (${r.organizerId})`);
}

const affected = rows.filter((r) => r.count > 0);
console.log(`\nGrand total across all eBay-connected organizers: ${grandTotal}`);
console.log(`Organizers affected (count > 0): ${affected.length} of ${rows.length} eBay-connected organizers`);
if (affected.length > 1 || (affected.length === 1 && affected[0].businessName !== 'Artifact')) {
  console.log('\n>>> NOTE: this backlog is NOT limited to Artifact -- see the per-organizer breakdown above.');
}

await prisma.$disconnect();
