// One-off reconciliation script — stranded POS "Stripe QR" sale, 2026-07-22
//
// The charge is real and already captured by Stripe (PaymentIntent
// pi_3Tw4ESLIWHQCHu7505o8jWp4, $14.47, charged 2026-07-22T17:47:04.000Z) and
// transferred to the organizer's connected account. Two now-fixed webhook bugs
// (ProcessedWebhookEvent schema drift causing a P2011 crash, plus missing
// diagnostic logging) meant checkout.session.completed never recorded this
// sale in FindA.Sale's own database. This script makes FindA.Sale's Prisma
// records match what actually happened — it does NOT touch Stripe.
//
// REWRITE NOTE: an earlier version of this script wrongly assumed this was a
// misc/no-item sale and safely aborted on discovering the POSPaymentLink
// actually has 3 real itemIds. This version replicates FindA.Sale's real
// multi-item POS completion logic (see stripeController.ts's
// checkout.session.completed handler, POS Payment Link branch) so the
// reconciliation is indistinguishable from a normal completion.
//
// TWO RUN MODES:
//   npx tsx scripts/reconcile-2026-07-22-pos-sale.ts            # dry run, read-only, prints a preview
//   npx tsx scripts/reconcile-2026-07-22-pos-sale.ts --apply    # actually writes (stock decrement + Purchase rows + status)
//
// Safe to re-run in either mode: if the POSPaymentLink is already COMPLETED,
// it prints that and exits cleanly without touching anything.
//
// NOTE: imports the runtime PrismaClient directly from packages/database's
// generated client (../../database/node_modules/@prisma/client) rather than
// the ambient `@prisma/client` — the backend's own node_modules/@prisma/client
// junction points at a stale root pnpm store copy that `prisma generate`
// isn't updating (confirmed root cause this session: `prisma generate`
// always writes next to wherever packages/database's own @prisma/client
// dependency lives, regardless of invoking CWD or --schema flag — a separate,
// still-open pnpm workspace-linking bug, not something this one-off script
// should have to wait on).
//
// For the same reason, this script does NOT import sellItemUnits from
// ../src/services/itemStockService.ts — that module's top-level `import {
// prisma } from '../lib/prisma'` would instantiate the backend's own
// stale/unreliable PrismaClient singleton as a side effect just by loading
// the module. Instead the atomic guarded-stock-decrement logic is copied
// inline below, with the exact same semantics (guarded conditional UPDATE,
// never read-then-write) — see itemStockService.ts for the original.
// getPlatformFeeRate has no such side effect (pure function, no Prisma
// import) so it's imported normally from feeCalculator.ts.

import { PrismaClient, Prisma } from '../../database/node_modules/@prisma/client';
import { getPlatformFeeRate, SubscriptionTier } from '../src/utils/feeCalculator';

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');

const POS_PAYMENT_LINK_ID = 'cmrwdj6hb00aottrxnqm0hr6r';
const STRIPE_PAYMENT_INTENT_ID = 'pi_3Tw4ESLIWHQCHu7505o8jWp4'; // informational only — see note below on why Purchase rows use a synthetic id instead
const REAL_STRIPE_TOTAL_DOLLARS = 14.47; // actual amount charged, from Stripe — sanity-check reference only, not written anywhere
const REAL_STRIPE_APPLICATION_FEE_DOLLARS = 1.16; // actual Stripe application_fee_amount — informational only; production recomputes fee per-item from the organizer's tier rather than reusing this
const CHARGE_TIME = new Date('2026-07-22T17:47:04.000Z'); // actual charge-succeeded time, from Stripe — used as completedAt for historical accuracy (production sets `new Date()` on a live webhook; this is a deliberate backfill difference)

class LocalInsufficientStockError extends Error {
  constructor(itemId: string, remaining: number) {
    super(`Cannot sell 1 unit of item ${itemId} — only ${remaining} remaining.`);
    this.name = 'LocalInsufficientStockError';
  }
}

// Deliberate inline copy of itemStockService.ts's sellItemUnits atomic
// semantics (guarded conditional UPDATE, re-checks capacity in the WHERE
// clause so no oversell race is possible) — see header note on why this
// isn't imported directly. Always called with unitsSold=1 here.
async function sellOneUnit(
  tx: Prisma.TransactionClient,
  itemId: string
): Promise<{ fullySoldOut: boolean; remainingStock: number }> {
  const guarded = await tx.$executeRaw`
    UPDATE "Item"
    SET "stockSold" = "stockSold" + 1
    WHERE "id" = ${itemId}
      AND "stockSold" + 1 <= COALESCE("stockTotal", 1)
  `;

  if (guarded === 0) {
    const existing = await tx.item.findUnique({
      where: { id: itemId },
      select: { stockTotal: true, stockSold: true },
    });
    if (!existing) {
      throw new Error(`sellOneUnit: item ${itemId} not found`);
    }
    const remaining = (existing.stockTotal ?? 1) - existing.stockSold;
    throw new LocalInsufficientStockError(itemId, Math.max(remaining, 0));
  }

  const updated = await tx.item.findUniqueOrThrow({
    where: { id: itemId },
    select: { stockTotal: true, stockSold: true, status: true },
  });

  const total = updated.stockTotal ?? 1;
  const fullySoldOut = updated.stockSold >= total;

  if (fullySoldOut && updated.status !== 'SOLD') {
    await tx.item.update({ where: { id: itemId }, data: { status: 'SOLD' } });
  }

  return { fullySoldOut, remainingStock: Math.max(total - updated.stockSold, 0) };
}

async function main() {
  const link = await prisma.pOSPaymentLink.findUnique({ where: { id: POS_PAYMENT_LINK_ID } });

  if (!link) {
    console.error(`ABORT: POSPaymentLink ${POS_PAYMENT_LINK_ID} not found. Nothing changed.`);
    process.exit(1);
  }

  if (link.status === 'COMPLETED') {
    console.log(`Already COMPLETED (completedAt=${link.completedAt?.toISOString()}). Nothing to do — safe no-op.`);
    return;
  }

  const items = await prisma.item.findMany({ where: { id: { in: link.itemIds } } });

  if (items.length !== link.itemIds.length) {
    const foundIds = new Set(items.map((i) => i.id));
    const missing = link.itemIds.filter((id) => !foundIds.has(id));
    console.error(
      `ABORT: expected ${link.itemIds.length} items but found ${items.length}. ` +
      `Missing/deleted item id(s): [${missing.join(', ')}]. Refusing to create partial purchases — needs manual review.`
    );
    process.exit(1);
  }

  const saleAndOrganizer = await prisma.sale.findUnique({
    where: { id: link.saleId },
    select: { organizer: { select: { subscriptionTier: true } } },
  });
  const tier = (saleAndOrganizer?.organizer?.subscriptionTier ?? null) as SubscriptionTier;
  const feeRate = getPlatformFeeRate(tier);

  // Preview / sanity-check numbers (used in both modes)
  let sumAmounts = 0;
  const preview = items.map((item) => {
    const amount = item.price || 0;
    const platformFeeAmount = parseFloat((amount * feeRate).toFixed(2));
    sumAmounts += amount;
    return {
      id: item.id,
      title: item.title,
      price: item.price,
      stockTotal: item.stockTotal ?? 1,
      stockSold: item.stockSold,
      status: item.status,
      wouldBeFullySoldOut: item.stockSold + 1 >= (item.stockTotal ?? 1),
      amount,
      platformFeeAmount,
    };
  });

  console.log('--- Preview ---');
  console.log(`POSPaymentLink: ${link.id} (status=${link.status}, saleId=${link.saleId})`);
  console.log(`Organizer subscription tier: ${tier ?? 'null (defaults to SIMPLE)'} -> fee rate ${feeRate}`);
  for (const p of preview) {
    console.log(
      `  Item ${p.id} "${p.title}" — price=$${p.price ?? '0 (null)'}, ` +
      `stock ${p.stockSold}/${p.stockTotal} -> ${p.stockSold + 1}/${p.stockTotal} ` +
      `(${p.wouldBeFullySoldOut ? 'would become SOLD' : 'stays available'}), ` +
      `current status=${p.status} -> Purchase amount=$${p.amount.toFixed(2)}, platformFeeAmount=$${p.platformFeeAmount.toFixed(2)}`
    );
  }
  console.log(`Sum of item amounts: $${sumAmounts.toFixed(2)} (real Stripe charge was $${REAL_STRIPE_TOTAL_DOLLARS.toFixed(2)})`);
  if (Math.abs(sumAmounts - REAL_STRIPE_TOTAL_DOLLARS) > 0.02) {
    console.warn(
      `  WARNING: sum of item prices does not match the real Stripe charge amount ` +
      `(diff $${Math.abs(sumAmounts - REAL_STRIPE_TOTAL_DOLLARS).toFixed(2)}). Review before applying.`
    );
  }
  console.log(
    `(Reference only — real Stripe application_fee_amount was $${REAL_STRIPE_APPLICATION_FEE_DOLLARS.toFixed(2)}; ` +
    `production recomputes platformFeeAmount per item from the organizer's tier rather than reusing this.)`
  );
  console.log(`Purchase rows will use stripePaymentIntentId="pos_${link.id}_<itemId>" per item (NOT ${STRIPE_PAYMENT_INTENT_ID} — see header note on why this differs from production's bare "pos_${link.id}" convention, which hits a real DB constraint bug on 2+ items).`);

  if (!APPLY) {
    console.log('\nDRY RUN — no changes made. Re-run with --apply to execute.');
    return;
  }

  console.log('\n--apply passed — executing transaction...');

  const result = await prisma.$transaction(async (tx) => {
    await tx.pOSPaymentLink.update({
      where: { id: link.id },
      data: { status: 'COMPLETED', completedAt: CHARGE_TIME },
    });

    const fullySoldOutIds: string[] = [];
    const partialSaleUpdates: { itemId: string; remainingStock: number }[] = [];

    for (const itemId of link.itemIds) {
      try {
        const { fullySoldOut, remainingStock } = await sellOneUnit(tx, itemId);
        if (fullySoldOut) fullySoldOutIds.push(itemId);
        else partialSaleUpdates.push({ itemId, remainingStock });
      } catch (stockErr: any) {
        if (stockErr instanceof LocalInsufficientStockError) {
          console.error(`[reconcile] Oversold race on item ${itemId}:`, stockErr.message);
          // Matches production: still record the Purchase below — the customer
          // already paid via Stripe, so revenue must be recorded even if the
          // inventory decrement lost a race against another channel.
        } else {
          throw stockErr;
        }
      }
    }

    const txItems = await tx.item.findMany({ where: { id: { in: link.itemIds } } });

    const purchaseIds: string[] = [];
    for (const item of txItems) {
      const purchase = await tx.purchase.create({
        data: {
          itemId: item.id,
          saleId: link.saleId,
          amount: item.price || 0,
          platformFeeAmount: parseFloat(((item.price || 0) * feeRate).toFixed(2)),
          status: 'PAID',
          source: 'POS',
          // NOTE: production's stripeController.ts uses the bare `pos_${link.id}` for every
          // item's Purchase row in a multi-item POS link — that's what triggered the P2002
          // below. Migration 20260707120000_purchase_pi_partial_unique added a partial unique
          // index on Purchase.stripePaymentIntentId (WHERE NOT NULL) that conflicts with an
          // earlier migration (20260409_purchase_pi_non_unique) which deliberately DROPPED a
          // unique constraint on this exact column *because* "a single Stripe PaymentIntent
          // (multi-item POS cart) can produce multiple Purchase rows." The July migration
          // silently reintroduced the bug the April one fixed — this affects the live webhook
          // too (POS Payment Link AND Cart Checkout), not just this script. Flagged separately
          // for a real fix; worked around HERE by appending the item id so each row is unique.
          stripePaymentIntentId: `pos_${link.id}_${item.id}`,
        },
      });
      purchaseIds.push(purchase.id);
    }

    await tx.pOSPaymentLink.update({
      where: { id: link.id },
      data: { purchaseIds },
    });

    return { purchaseIds, fullySoldOutIds, partialSaleUpdates };
  });

  console.log(`\nDONE. Purchases created: [${result.purchaseIds.join(', ')}]. POSPaymentLink ${POS_PAYMENT_LINK_ID} marked COMPLETED.`);
  if (result.fullySoldOutIds.length) {
    console.log(`Items now fully SOLD: [${result.fullySoldOutIds.join(', ')}]`);
  }
  if (result.partialSaleUpdates.length) {
    console.log(`Items with remaining stock: ${JSON.stringify(result.partialSaleUpdates)}`);
  }
  console.log(
    'NOTE: this script does not fire the eBay/Shopify/Facebook cross-channel "sold" hooks that the ' +
    'live webhook fires for fully-sold-out items — if any of the items above show as newly SOLD and are ' +
    'also listed on eBay/Shopify/Facebook, those listings will need manual removal.'
  );
}

main()
  .catch((e) => {
    console.error('FAILED:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
