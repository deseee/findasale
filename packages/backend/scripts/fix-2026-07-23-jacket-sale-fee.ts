// Correction for the 2026-07-23 jacket-sale reconciliation
// (reconcile-2026-07-23-jacket-sale.ts). That script used a hardcoded 10%
// platform fee rate, but this organizer (acct_1Tr2qwLpIQaEWoSK, TEAMS tier)
// is on the 8% discounted rate per packages/backend/src/utils/feeCalculator.ts
// (getPlatformFeeRate: SIMPLE=10%, PRO/TEAMS=8%, confirmed correct S528 per
// claude_docs/STACK.md) -- confirmed directly with Patrick 2026-07-23: "no
// discrepancy, artifact is teams so they pay 8%". Real Stripe
// application_fee_amount on this charge (232 cents / $28.99 = 8.003%) also
// confirms 8% is correct.
//
// This script corrects the single Purchase row created by the earlier
// reconciliation from the wrong $2.90 (10%) to the correct $2.32 (8%).
// It does NOT touch stock, item status, or the POSPaymentLink -- those were
// already correct.
//
// Run from packages/backend, dry-run by default:
//   npx tsx scripts/fix-2026-07-23-jacket-sale-fee.ts
//   npx tsx scripts/fix-2026-07-23-jacket-sale-fee.ts --apply

import { PrismaClient } from '../../database/node_modules/@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const PURCHASE_ID = 'cmrxtkhjf0002so70s19591i9';
const ITEM_ID = 'cmrl2owl1004rtoh5g8ld595z';
const EXPECTED_CURRENT_FEE = 2.9;
const CORRECT_FEE = 2.32; // 28.99 * 0.08, matches production's fee.toFixed(2) convention

async function main() {
  const purchase = await prisma.purchase.findUnique({ where: { id: PURCHASE_ID } });
  if (!purchase) {
    console.error('ABORT: Purchase not found.');
    process.exit(1);
  }
  if (purchase.itemId !== ITEM_ID) {
    console.error(`ABORT: itemId mismatch. Expected ${ITEM_ID}, got ${purchase.itemId}`);
    process.exit(1);
  }
  if (Math.abs((purchase.platformFeeAmount ?? 0) - EXPECTED_CURRENT_FEE) > 0.001) {
    console.error(`ABORT: current platformFeeAmount is $${purchase.platformFeeAmount}, expected $${EXPECTED_CURRENT_FEE}. Someone may have already fixed this -- stop and check manually.`);
    process.exit(1);
  }

  console.log('--- DRY RUN ---'.concat(APPLY ? ' (will APPLY)' : ' (pass --apply to execute)'));
  console.log(`Purchase ${purchase.id}: platformFeeAmount $${purchase.platformFeeAmount} -> $${CORRECT_FEE}`);

  if (!APPLY) {
    console.log('\nDry run only -- no changes made. Re-run with --apply to execute.');
    process.exit(0);
  }

  const updated = await prisma.purchase.update({
    where: { id: PURCHASE_ID },
    data: { platformFeeAmount: CORRECT_FEE },
  });

  console.log(`DONE: Purchase ${updated.id} platformFeeAmount corrected to $${updated.platformFeeAmount}.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('FAILED:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
