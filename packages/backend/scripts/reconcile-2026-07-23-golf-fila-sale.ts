// One-off reconciliation for the 2026-07-23 Wilson ProStaff Mallet Putter +
// Left Handed FILA Golf Club Set stranded POS sale -- same failure shape as
// the two earlier incidents today (comics $14.47, jacket $28.99):
// checkout.session.completed never visibly processed the POS Payment Link,
// so FindA.Sale never recorded the sale even though Stripe captured the
// charge. This is the first genuinely multi-item case found this session
// (2 items sharing one POSPaymentLink). Confirmed via:
//   - Stripe: charge ch_3TwQvyLIWHQCHu75113HYW3r, $118.50, destination
//     acct_1Tr2qwLpIQaEWoSK, via Payment Link plink_1TwQvSLIWHQCHu752haJAOgc
//     (application_fee_amount 948 cents = exactly 8.00% of $118.50),
//     created 2026-07-23 18:01:27 UTC.
//   - DB: POSPaymentLink cmrxthrmo006dc6358kzv45dp, status ACTIVE, itemIds=
//     [cmrxrq0hv002zc635vs3thct7, cmrpc6a0w000zp898grrq34qd], purchaseIds=[],
//     amount 11850, createdAt 2026-07-23 18:00:54.816.
//   - Railway logs 18:00-18:08 UTC: exactly 2 POST /api/stripe/webhook calls
//     (200, 14ms and 179ms) with ZERO application-level log output from
//     either -- same silent-failure pattern as the other two incidents today.
//     A diagnostic logging fix (unconditional event.id/event.type log,
//     commit 432b706b) is already live on Railway; it did not exist yet when
//     THIS incident's webhook calls happened (18:01 UTC, before the ~18:0X
//     deploy), so it did not catch this one either. Root cause is still
//     unresolved -- next occurrence after the deploy should be diagnosable.
//
// Platform fee rate note: CLAUDE.md/STACK.md document a flat 10% fee, but
// the real Stripe application_fee_amount on this charge (and the other two
// today) is consistently ~8.0%. This script uses the evidence-based 8% rate
// (confirmed exactly against this charge's own application_fee_amount:
// 948 / 11850 = 0.08 exactly) rather than the documented 10%, consistent
// with how the jacket-sale reconciliation was flagged. Patrick has not yet
// confirmed which number is authoritative -- if 10% turns out to be correct,
// this record (and the jacket one) will need a follow-up correction.
//
// Neither item has an eBay listing (ebayListingId and ebayOfferId both
// empty/null for both), so this is a DB-only reconciliation -- no eBay
// withdrawal step.
//
// Run from packages/backend, dry-run by default:
//   npx tsx scripts/reconcile-2026-07-23-golf-fila-sale.ts
//   npx tsx scripts/reconcile-2026-07-23-golf-fila-sale.ts --apply

import { PrismaClient } from '../../database/node_modules/@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const POS_LINK_ID = 'cmrxthrmo006dc6358kzv45dp';
const EXPECTED_STRIPE_PAYMENT_LINK_ID = 'plink_1TwQvSLIWHQCHu752haJAOgc';
const EXPECTED_AMOUNT_CENTS = 11850;
const PLATFORM_FEE_RATE = 0.08; // Evidence-based (real application_fee_amount = 948/11850 = 8.00% exactly). Documented rate (STACK.md) says 10% -- unresolved discrepancy, flagged to Patrick, not yet confirmed.

const ITEM_IDS = ['cmrxrq0hv002zc635vs3thct7', 'cmrpc6a0w000zp898grrq34qd'] as const;

async function main() {
  const link = await prisma.pOSPaymentLink.findUnique({ where: { id: POS_LINK_ID } });
  if (!link) {
    console.error('ABORT: POSPaymentLink not found.');
    process.exit(1);
  }
  if (link.stripePaymentLinkId !== EXPECTED_STRIPE_PAYMENT_LINK_ID) {
    console.error(`ABORT: stripePaymentLinkId mismatch. Expected ${EXPECTED_STRIPE_PAYMENT_LINK_ID}, got ${link.stripePaymentLinkId}`);
    process.exit(1);
  }
  if (link.amount !== EXPECTED_AMOUNT_CENTS) {
    console.error(`ABORT: amount mismatch. Expected ${EXPECTED_AMOUNT_CENTS}, got ${link.amount}`);
    process.exit(1);
  }
  if (link.status === 'COMPLETED') {
    console.log('Link is already COMPLETED -- nothing to do. Someone else may have fixed this already.');
    process.exit(0);
  }
  if (link.status !== 'ACTIVE') {
    console.error(`ABORT: unexpected link status "${link.status}" (expected ACTIVE). Needs manual review.`);
    process.exit(1);
  }

  const linkItemIds = [...link.itemIds].sort();
  const expectedItemIds = [...ITEM_IDS].sort();
  if (JSON.stringify(linkItemIds) !== JSON.stringify(expectedItemIds)) {
    console.error(`ABORT: itemIds mismatch. Expected ${JSON.stringify(expectedItemIds)}, got ${JSON.stringify(linkItemIds)}`);
    process.exit(1);
  }

  const items = await prisma.item.findMany({ where: { id: { in: [...ITEM_IDS] } } });
  if (items.length !== ITEM_IDS.length) {
    console.error(`ABORT: expected ${ITEM_IDS.length} items, found ${items.length}.`);
    process.exit(1);
  }

  let totalPrice = 0;
  for (const item of items) {
    if (item.status !== 'AVAILABLE') {
      console.error(`ABORT: item ${item.id} ("${item.title}") status is "${item.status}", not AVAILABLE. Needs manual review -- may already be handled.`);
      process.exit(1);
    }
    if (item.ebayListingId || item.ebayOfferId) {
      console.error(`ABORT: item ${item.id} ("${item.title}") unexpectedly has an eBay listing (ebayListingId=${item.ebayListingId}, ebayOfferId=${item.ebayOfferId}). This script assumes no eBay withdrawal is needed -- stop and review manually.`);
      process.exit(1);
    }
    totalPrice += item.price || 0;
  }
  const expectedTotal = EXPECTED_AMOUNT_CENTS / 100;
  if (Math.abs(totalPrice - expectedTotal) > 0.01) {
    console.error(`ABORT: sum of item prices ($${totalPrice.toFixed(2)}) does not match expected total ($${expectedTotal.toFixed(2)}).`);
    process.exit(1);
  }

  console.log('--- DRY RUN ---'.concat(APPLY ? ' (will APPLY)' : ' (pass --apply to execute)'));
  console.log(`POSPaymentLink: ${link.id} status=${link.status} amount=$${(link.amount / 100).toFixed(2)}`);
  for (const item of items) {
    const fee = parseFloat(((item.price || 0) * PLATFORM_FEE_RATE).toFixed(2));
    console.log(`Item: ${item.id} "${item.title}" price=$${item.price} status=${item.status} saleId=${item.saleId} -> platformFeeAmount=$${fee}`);
  }
  console.log(`Will create ${items.length} Purchase rows (source=POS, stripePaymentIntentId=pos_${link.id}), mark both items SOLD, and mark POSPaymentLink COMPLETED.`);
  console.log('No eBay withdrawal needed -- neither item has an eBay listing.');

  if (!APPLY) {
    console.log('\nDry run only -- no changes made. Re-run with --apply to execute.');
    process.exit(0);
  }

  const purchaseIds: string[] = [];
  await prisma.$transaction(async (tx) => {
    for (const item of items) {
      const guarded = await tx.$executeRaw`
        UPDATE "Item"
        SET "stockSold" = "stockSold" + 1
        WHERE "id" = ${item.id}
          AND "stockSold" + 1 <= COALESCE("stockTotal", 1)
      `;
      if (guarded === 0) {
        throw new Error(`Guarded stock update matched 0 rows for item ${item.id} -- oversold or item changed since dry run. Aborting transaction.`);
      }
      const updatedItem = await tx.item.findUniqueOrThrow({
        where: { id: item.id },
        select: { stockTotal: true, stockSold: true, status: true },
      });
      const total = updatedItem.stockTotal ?? 1;
      if (updatedItem.stockSold >= total && updatedItem.status !== 'SOLD') {
        await tx.item.update({ where: { id: item.id }, data: { status: 'SOLD' } });
      }

      const price = item.price || 0;
      const platformFeeAmount = parseFloat((price * PLATFORM_FEE_RATE).toFixed(2));

      const purchase = await tx.purchase.create({
        data: {
          itemId: item.id,
          saleId: item.saleId,
          amount: price,
          platformFeeAmount,
          status: 'PAID',
          source: 'POS',
          stripePaymentIntentId: `pos_${link.id}`,
        },
      });
      purchaseIds.push(purchase.id);
    }

    await tx.pOSPaymentLink.update({
      where: { id: link.id },
      data: { status: 'COMPLETED', completedAt: new Date(), purchaseIds },
    });
  });

  console.log(`DONE: Purchases [${purchaseIds.join(', ')}] created, both items marked SOLD, POSPaymentLink marked COMPLETED.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('FAILED:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
