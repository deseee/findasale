// One-off reconciliation script — stranded POS manual-card-entry sale, 2026-09-13
//
// The charge is real and already captured by Square (Payment
// B69Muocbneo2S7VVzTTVR17WZBHZY, $13.67 total = $12.99 item + $0.68 CNP fee,
// Visa debit ending 6403, captured 2026-09-13T15:52:07.131Z). manualCardPayment
// (posPaymentController.ts) created the charge successfully, but its very next
// step -- the post-capture idempotency lookup `prisma.purchase.findMany({
// where: { squarePaymentId } })` -- crashed with P2022 ("column
// Purchase.cashDebtCollectedAmount does not exist in the current database")
// because that column's migration
// (packages/database/prisma/migrations/20260912000000_add_purchase_cash_debt_collected_amount)
// had not been deployed to production yet. The whole request fell into
// manualCardPayment's outer catch and returned a bare 500 (which the POS UI
// then mislabeled "Card Was Declined") before ever reaching the
// Purchase.create / sellItemUnits code. Net effect: money taken, nothing
// recorded, item never marked sold. This script makes FindA.Sale's own
// records match what actually happened -- it does NOT touch Square, and it
// does NOT create a second charge.
//
// PRECONDITION -- DO NOT RUN THIS BEFORE THE MIGRATION IS DEPLOYED:
//   cd packages\database
//   $env:DATABASE_URL="<Railway DATABASE_URL>"
//   npx prisma migrate deploy
// Running this script before that migration lands will hit the exact same
// P2022 this script exists to clean up after. The script checks for this and
// aborts with a clear message rather than a raw stack trace if it happens.
//
// TWO RUN MODES (same convention as reconcile-2026-07-22-pos-sale.ts):
//   npx tsx scripts/reconcile-2026-09-13-eagles-pos-manual-card-sale.ts            # dry run, read-only, prints a preview
//   npx tsx scripts/reconcile-2026-09-13-eagles-pos-manual-card-sale.ts --apply    # actually writes (Purchase row + stock decrement)
//
// Safe to re-run in either mode: if a Purchase already exists for this
// Square payment, it prints that and exits cleanly without touching anything.
//
// NOTE (same reasoning as reconcile-2026-07-22-pos-sale.ts's header): imports
// the runtime PrismaClient directly from packages/database's generated client
// rather than the ambient `@prisma/client`, and does NOT import sellItemUnits
// from ../src/services/itemStockService.ts (that module's top-level `import {
// prisma } from '../lib/prisma'` would instantiate the backend's own stale
// PrismaClient singleton as a side effect just by loading the module).
// Instead the atomic guarded-stock-decrement logic is copied inline below,
// with the exact same semantics (guarded conditional UPDATE, never
// read-then-write) -- see itemStockService.ts's sellItemUnits for the
// original. getPlatformFeeRate/snapshotForCommissionOnly have no such side
// effect (pure functions, feeCalculator.ts has zero imports of its own) so
// they're imported normally.
//
// IMPORTANT MANUAL FOLLOW-UP THIS SCRIPT DELIBERATELY DOES NOT DO: this item
// is currently live-pushed to eBay ("Live on eBay" confirmed on its Edit Item
// page). Marking it SOLD here does NOT end that eBay listing or sync
// Shopify/Facebook -- those live in ebayController.ts/shopifyService.ts/
// facebookNudgeService.ts, which this standalone script deliberately does not
// import (same stale-Prisma-singleton risk as itemStockService.ts, likely
// worse given how much those controllers pull in transitively). If this
// script reports the item as newly SOLD, the eBay listing for "Eagles
// Self-Titled Album Vinyl Record, Asylum Records" MUST be ended manually
// (Edit Item page -> "Re-push to eBay" area / End listing) right after this
// runs, or it remains buyable a second time on eBay.

import { PrismaClient, Prisma } from '../../database/node_modules/@prisma/client';
import { getPlatformFeeRate, snapshotForCommissionOnly, SubscriptionTier } from '../src/utils/feeCalculator';

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');

const ITEM_ID = 'cmtsyxf9a006t6p9vehiyvpbz'; // "Eagles Self-Titled Album Vinyl Record, Asylum Records"
const SALE_ID = 'cmpt2oq6q00138cehpgqx3huk'; // Artifact Downtown Paw Paw
const SQUARE_PAYMENT_ID = 'B69Muocbneo2S7VVzTTVR17WZBHZY';
const SQUARE_ORDER_ID = 'jrv6CeD32BS7jJ4DsrX9D9uthYEZY';
const REAL_SQUARE_TOTAL_CENTS = 1367; // actual amount charged (item + CNP fee), from Square -- sanity-check reference only
const REAL_SQUARE_ITEM_AMOUNT_CENTS = 1299; // the item's own share of the charge (excludes the $0.68 CNP surcharge, which is a buyer-side fee, not organizer revenue -- never written to Purchase.amount, matching manualCardPayment's own per-item accounting)
const CHARGE_TIME = new Date('2026-09-13T15:52:07.131Z'); // Square's card_payment_timeline.captured_at -- used as Purchase.createdAt for historical accuracy

class LocalInsufficientStockError extends Error {
  constructor(itemId: string, remaining: number) {
    super(`Cannot sell 1 unit of item ${itemId} — only ${remaining} remaining.`);
    this.name = 'LocalInsufficientStockError';
  }
}

// Deliberate inline copy of itemStockService.ts's sellItemUnits atomic
// semantics (guarded conditional UPDATE, re-checks capacity in the WHERE
// clause so no oversell race is possible) -- see header note on why this
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
  // Guard against double-application FIRST, before touching anything else.
  let existing;
  try {
    existing = await prisma.purchase.findFirst({ where: { squarePaymentId: SQUARE_PAYMENT_ID } });
  } catch (err: any) {
    if (err?.code === 'P2022') {
      console.error(
        'ABORT: still hitting P2022 (column does not exist). The pending migration ' +
        '(20260912000000_add_purchase_cash_debt_collected_amount) has NOT been deployed to ' +
        'this database yet. Run `npx prisma migrate deploy` against Railway first, then re-run ' +
        'this script. Nothing was changed.'
      );
      process.exit(1);
    }
    throw err;
  }

  if (existing) {
    console.log(
      `Already reconciled — Purchase ${existing.id} already exists for Square payment ` +
      `${SQUARE_PAYMENT_ID} (status=${existing.status}, created ${existing.createdAt.toISOString()}). ` +
      'Nothing to do — safe no-op.'
    );
    return;
  }

  const item = await prisma.item.findUnique({
    where: { id: ITEM_ID },
    select: {
      id: true,
      title: true,
      price: true,
      status: true,
      stockTotal: true,
      stockSold: true,
      saleId: true,
      sale: {
        select: {
          id: true,
          organizerId: true,
          organizer: { select: { subscriptionTier: true, referralDiscountExpiry: true } },
        },
      },
    },
  });

  if (!item) {
    console.error(`ABORT: item ${ITEM_ID} not found. Nothing changed.`);
    process.exit(1);
  }

  if (item.saleId !== SALE_ID) {
    console.error(
      `ABORT: item ${ITEM_ID}'s saleId (${item.saleId}) does not match the expected ` +
      `sale ${SALE_ID}. Refusing to guess — needs manual review. Nothing changed.`
    );
    process.exit(1);
  }

  if (item.status !== 'AVAILABLE') {
    console.error(
      `ABORT: item ${ITEM_ID} ("${item.title}") is status=${item.status}, not AVAILABLE. ` +
      'Either someone already fixed this manually, or something else changed it since the ' +
      'incident — refusing to overwrite. Review before doing anything else. Nothing changed.'
    );
    process.exit(1);
  }

  const organizer = item.sale?.organizer;
  const tier = (organizer?.subscriptionTier ?? null) as SubscriptionTier;
  const hasReferralDiscount = !!(organizer?.referralDiscountExpiry && organizer.referralDiscountExpiry > new Date());
  const cardFeeRate = hasReferralDiscount ? 0 : getPlatformFeeRate(tier);

  const itemAmountCents = Math.round((item.price ?? 0) * 100);
  const itemFeeCents = Math.round(itemAmountCents * cardFeeRate);
  const amount = itemAmountCents / 100;
  const platformFeeAmount = itemFeeCents / 100;

  console.log('--- Preview ---');
  console.log(`Item: ${item.id} "${item.title}" — price=$${(item.price ?? 0).toFixed(2)}, status=${item.status}, stock ${item.stockSold}/${item.stockTotal ?? 1}`);
  console.log(`Organizer subscription tier: ${tier ?? 'null (defaults to SIMPLE)'}${hasReferralDiscount ? ' (referral discount active -> 0% rate)' : ''} -> fee rate ${cardFeeRate}`);
  console.log(`Purchase to create: amount=$${amount.toFixed(2)}, platformFeeAmount=$${platformFeeAmount.toFixed(2)}, processor=SQUARE, squarePaymentId=${SQUARE_PAYMENT_ID}`);
  if (itemAmountCents !== REAL_SQUARE_ITEM_AMOUNT_CENTS) {
    console.warn(
      `  WARNING: item's current price ($${(itemAmountCents / 100).toFixed(2)}) does not match the ` +
      `expected charged amount ($${(REAL_SQUARE_ITEM_AMOUNT_CENTS / 100).toFixed(2)}) -- the price may ` +
      'have been edited since the sale. Review before applying.'
    );
  }
  console.log(`(Reference only — real Square total incl. CNP fee was $${(REAL_SQUARE_TOTAL_CENTS / 100).toFixed(2)}; the $0.68 CNP surcharge is a buyer-side fee, never written to Purchase.amount.)`);

  if (!APPLY) {
    console.log('\nDRY RUN — no changes made. Re-run with --apply to execute.');
    return;
  }

  console.log('\n--apply passed — executing transaction...');

  const result = await prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.create({
      data: {
        userId: null,
        itemId: item.id,
        saleId: SALE_ID,
        amount,
        platformFeeAmount,
        ...snapshotForCommissionOnly(platformFeeAmount, cardFeeRate),
        processor: 'SQUARE',
        squarePaymentId: SQUARE_PAYMENT_ID,
        squareOrderId: SQUARE_ORDER_ID,
        status: 'PAID',
        source: 'POS',
        createdAt: CHARGE_TIME,
      },
    });

    const { fullySoldOut, remainingStock } = await sellOneUnit(tx, item.id);

    return { purchaseId: purchase.id, fullySoldOut, remainingStock };
  });

  console.log(`\nDONE. Purchase created: ${result.purchaseId}. Item ${ITEM_ID} stock: ${result.fullySoldOut ? 'FULLY SOLD OUT (status set to SOLD)' : `${result.remainingStock} remaining, still AVAILABLE`}.`);

  if (result.fullySoldOut) {
    console.log(
      '\n*** ACTION REQUIRED: this item is currently live-pushed to eBay. This script does NOT ' +
      'end eBay/Shopify/Facebook listings (see header note) — go end the "Eagles Self-Titled ' +
      'Album Vinyl Record, Asylum Records" eBay listing manually right now, or it stays buyable ' +
      'a second time there. ***'
    );
  }
}

main()
  .catch((e) => {
    console.error('FAILED:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
