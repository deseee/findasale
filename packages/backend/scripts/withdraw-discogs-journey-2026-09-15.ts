import { withdrawDiscogsListingIfExists } from '../src/services/marketplace/discogsListingConnector.ts';
import { prisma } from '../src/lib/prisma.ts';

const ITEM_ID = 'cmtsyyhig007o6p9vlk04ocvh'; // Journey Infinity Vinyl Record, 1978, Columbia Records

async function main() {
  const before = await prisma.item.findUnique({
    where: { id: ITEM_ID },
    select: { id: true, title: true, status: true, discogsListingId: true, discogsListedAt: true },
  });
  console.log('BEFORE:', JSON.stringify(before, null, 2));

  if (!before) {
    console.error('Item not found, aborting.');
    process.exit(1);
  }
  if (!before.discogsListingId) {
    console.log('discogsListingId already null -- nothing to withdraw.');
    process.exit(0);
  }

  await withdrawDiscogsListingIfExists(ITEM_ID);

  const after = await prisma.item.findUnique({
    where: { id: ITEM_ID },
    select: { id: true, title: true, status: true, discogsListingId: true, discogsListedAt: true },
  });
  console.log('AFTER:', JSON.stringify(after, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error('Script failed:', e);
  process.exit(1);
});
