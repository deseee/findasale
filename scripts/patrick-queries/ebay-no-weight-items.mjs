// Run from packages/database with DATABASE_URL set to the Railway production URL.
// Answers: for the items live on eBay with no confirmed weight, are they
// LOCAL_PICKUP_ONLY (exempt), genuinely mis-weighted, or something else --
// and roughly when they were created (helps tell "published by FindA.Sale"
// from "linked to a pre-existing eBay listing via reconciliation").
import { PrismaClient } from '../../packages/database/node_modules/.prisma/client/index.js';
const prisma = new PrismaClient();

const items = await prisma.item.findMany({
  where: {
    ebayListingId: { not: null },
    packageConfirmedByOrganizer: false,
  },
  select: {
    id: true,
    title: true,
    ebayListingId: true,
    packageWeightOz: true,
    packageEstimateSource: true,
    ebayShippingOverride: true,
    shippingAvailable: true,
    createdAt: true,
    sale: { select: { organizer: { select: { businessName: true } } } },
  },
  orderBy: { createdAt: 'asc' },
});

console.log(`Items live on eBay with packageConfirmedByOrganizer=false: ${items.length}\n`);
let localPickup = 0, noWeightAtAll = 0, hasWeightNoConfirm = 0;
for (const it of items) {
  const isLocalPickup = it.ebayShippingOverride === 'LOCAL_PICKUP_ONLY';
  if (isLocalPickup) localPickup++;
  else if (it.packageWeightOz == null) noWeightAtAll++;
  else hasWeightNoConfirm++;
  console.log(JSON.stringify({
    id: it.id, title: it.title, org: it.sale?.organizer?.businessName,
    ebayListingId: it.ebayListingId, weightOz: it.packageWeightOz,
    source: it.packageEstimateSource, shippingOverride: it.ebayShippingOverride,
    shippingAvailable: it.shippingAvailable, createdAt: it.createdAt,
  }));
}
console.log(`\nBreakdown: ${localPickup} LOCAL_PICKUP_ONLY (exempt) | ${noWeightAtAll} truly no weight value at all | ${hasWeightNoConfirm} have a weight estimate but organizer never confirmed it`);
await prisma.$disconnect();
