/**
 * bulkLotPackCheckout (ADR-136 Addendum E, roadmap #659): the money-bearing core of buying a bulk lot PACK online.
 *
 * The HTTP layer (controllers/bulkLotPackPaymentController.ts) does the request parsing, the sale and shopper guards and the
 * item load. This module does what must be exactly right and testable without Square or a database:
 *   - the fee math for a pack charge (the same calculateApplicationFee + applyInclusiveFloor the single item checkout uses)
 *   - the refusals that keep a pack sale simple and correct (pickup only, no coupon or item discount, not too cheap to charge)
 *   - the duplicate-purchase protection (see below)
 *   - the order of events around the charge, and what happens when something goes wrong AFTER the card was charged
 * Every external effect (charge, refund, cash fee debt, affiliate lookup) is injected, so this module imports no Prisma client.
 *
 * DUPLICATE PROTECTION. createSquareCharge folds the card token into Square's idempotency key, so two submits with two different
 * card tokens (a double click that tokenized twice, a retry after a reload) are two real charges. Square cannot dedupe them, so
 * this layer does: the Purchase carries clientTransactionId = "bulkpack:<buyer>:<clientToken>" (the page's own token).
 *   1. BEFORE any money moves: a Purchase with that clientTransactionId already exists -> answer with it (REPLAY), charge nothing.
 *   2. AFTER the charge, in one transaction under an advisory lock on that key: if a Purchase with that key appeared meanwhile
 *      (two submits ran at the same time), this payment is the duplicate: refund it in full, take no cards, answer with the first.
 *
 * AFTER-CHARGE FAILURES (the card is already charged). Cards and the Purchase row are written in ONE transaction, so the state
 * "cards taken but no Purchase" cannot happen.
 *   - cards ran out (BulkLotError): nothing was written; refund in full.
 *   - the transaction failed for another reason (dropped connection, timeout): read back by payment id. Found -> it did commit,
 *     treat as a replay. Not found -> it did not commit, refund in full. The read itself failed -> we do not know, so we do NOT
 *     refund (a refund of a sale that did commit would lose the sale); the caller tells the shopper not to pay again and Sentry
 *     alerts. That last case is the one gap with no automatic recovery (ADR-136 Addendum E, E.9).
 */
import crypto from 'crypto';
import { SellUnitsInTx, bulkLotError, isBulkLotError, lockBulkSaleKey, sellBulkLinesInTransaction } from './bulkLotService';
import type { PackPlan } from './bulkLotPackService';
import { ApplicationFeeBreakdown, applyInclusiveFloor, calculateApplicationFee, snapshotFromBreakdown } from '../../utils/feeCalculator';

/** Square's own floor for a card charge. A pack under this cannot be charged. */
export const PACK_MIN_CHARGE_CENTS = 50;
/**
 * Square refuses a charge whose application fee is above 60% of the payment when the payment is under $5.00, and above 90% from
 * $5.00 up (https://developer.squareup.com/docs/payments-api/collect-fees/additional-considerations). With the 75 cent fee floor a
 * pack priced under $1.25 would be sent to Square and refused after the shopper typed the card, so it is refused here first.
 */
export const PACK_APP_FEE_CAP_THRESHOLD_CENTS = 500;
export const PACK_APP_FEE_CAP_UNDER_THRESHOLD_BP = 6000;
export const PACK_APP_FEE_CAP_BP = 9000;
export const PACK_TOKEN_MIN_LENGTH = 8;
export const PACK_TOKEN_MAX_LENGTH = 100;

/** The page's retry token: a string of 8 to 100 safe characters, or null. Required for a pack purchase. */
export function parsePackClientToken(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (t.length < PACK_TOKEN_MIN_LENGTH || t.length > PACK_TOKEN_MAX_LENGTH) return null;
  return /^[A-Za-z0-9._:-]+$/.test(t) ? t : null;
}

/** Who is buying, as a key: the account id, or a short hash of the guest email (never the address itself). */
export function packBuyerKey(userId: string | null | undefined, guestEmail: string | null | undefined): string {
  if (userId) return `u:${userId}`;
  const email = (guestEmail ?? '').trim().toLowerCase();
  return `g:${crypto.createHash('sha256').update(email).digest('hex').slice(0, 16)}`;
}

/** The Purchase.clientTransactionId of a pack purchase. */
export function packClientTransactionId(buyerKey: string, clientToken: string): string {
  return `bulkpack:${buyerKey}:${clientToken}`;
}

// ---------------------------------------------------------------------------
// Fees and refusals (pure)
// ---------------------------------------------------------------------------

export interface PackFees {
  feeBreakdown: ApplicationFeeBreakdown;
  /** The platform fee in cents after the per-transaction minimum floor (no buyer premium: a pack is never an auction). */
  platformFeeCents: number;
}

/** Same two calls the single item Square checkout makes, so a pack pays the same commission as any online item. */
export function computePackFees(args: { cents: number; feePercent: number }): PackFees {
  const raw = calculateApplicationFee(args.cents, args.feePercent, false);
  const feeBreakdown = applyInclusiveFloor(raw, args.feePercent);
  return { feeBreakdown, platformFeeCents: feeBreakdown.applicationFeeCents };
}

/**
 * Throws BulkLotError when a pack cannot be sold online as asked:
 *   BULK_PACK_PICKUP_ONLY (shipping requested: a pack has no confirmed shipping weight), BULK_PACK_NO_DISCOUNT (a coupon or an
 *   item discount: both assume one unit), BULK_PACK_TOO_CHEAP (under Square's $0.50, or the platform fee is above what Square
 *   allows as an application fee: 60% of the payment under $5.00, 90% from $5.00).
 */
export function assertPackSellableOnline(args: { cents: number; platformFeeCents: number; shippingRequested: unknown; couponCode: unknown; organizerDiscountAmount: unknown }): void {
  if (args.shippingRequested) throw bulkLotError('BULK_PACK_PICKUP_ONLY', 400);
  const hasCoupon = typeof args.couponCode === 'string' && args.couponCode.trim().length > 0;
  const discount = Number(args.organizerDiscountAmount ?? 0);
  if (hasCoupon || (Number.isFinite(discount) && discount > 0)) throw bulkLotError('BULK_PACK_NO_DISCOUNT', 400);
  const feeCapBp = args.cents < PACK_APP_FEE_CAP_THRESHOLD_CENTS ? PACK_APP_FEE_CAP_UNDER_THRESHOLD_BP : PACK_APP_FEE_CAP_BP;
  if (args.cents < PACK_MIN_CHARGE_CENTS || args.platformFeeCents >= args.cents || args.platformFeeCents * 10_000 > args.cents * feeCapBp) {
    throw bulkLotError('BULK_PACK_TOO_CHEAP', 400);
  }
}

// ---------------------------------------------------------------------------
// The checkout run
// ---------------------------------------------------------------------------

export interface PackCheckoutDb {
  $transaction<T>(fn: (tx: any) => Promise<T>, options?: any): Promise<T>;
  purchase: { findFirst(args: any): Promise<any> };
}

export type PackRefundReason = 'SOLD_OUT' | 'DUPLICATE' | 'RECORD_FAILED';
export interface PackRefundResult {
  status: 'REFUNDED' | 'MANUAL' | 'NOTHING_TO_REFUND';
  refundCents: number;
}

export interface PackChargeOk {
  ok: true;
  paymentId: string;
  cardFingerprint: string | null;
}
export interface PackChargeFail {
  ok: false;
  code: string;
  message: string;
}

export interface PackCheckoutDeps {
  db: PackCheckoutDb;
  /** itemStockService.sellItemUnitsInTransaction */
  sell: SellUnitsInTx;
  /** Claims outstanding cash fee debt into the app fee (cashFeeService.applyCashDebtToAppFee). */
  applyDebt(args: { baseAppFeeCents: number; saleAmountCents: number }): Promise<{ appFeeCents: number; debtAppliedCents: number }>;
  /** Gives a claim back (cashFeeService.releaseCashDebtClaim). */
  releaseDebt(debtAppliedCents: number): Promise<void>;
  /** The Square charge. May throw (network). */
  charge(args: { amountCents: number; appFeeCents: number; idempotencyKey: string }): Promise<PackChargeOk | PackChargeFail>;
  /** Refunds `amountCents` of `paymentId` in full and tells the organizer and shopper. Never throws. */
  refund(args: { paymentId: string; amountCents: number; reason: PackRefundReason }): Promise<PackRefundResult>;
  /** Validated affiliate attribution for the sale, or null. Never fails the checkout. */
  resolveAttribution(): Promise<string | null>;
  /** Sentry. Best effort. */
  captureError(err: unknown, extra: Record<string, unknown>): void;
}

export interface PackCheckoutInput {
  itemId: string;
  saleId: string;
  /** Purchase.clientTransactionId, from packClientTransactionId. */
  txnKey: string;
  /** Base Square idempotency key (createSquareCharge adds the card token). */
  idempotencyKey: string;
  plan: PackPlan;
  feeBreakdown: ApplicationFeeBreakdown;
  platformFeeCents: number;
  feePercent: number;
  buyer: { userId: string | null; email: string | null; name: string | null };
}

export type PackCheckoutOutcome =
  | { outcome: 'REPLAY'; purchase: any; commitRecovered?: boolean }
  | { outcome: 'DECLINED'; code: string; message: string }
  | {
      outcome: 'RECORDED';
      purchase: any;
      paymentId: string;
      cardFingerprint: string | null;
      debtAppliedCents: number;
      appFeeCents: number;
      attributedAffiliateLinkId: string | null;
      fullySoldOut: boolean;
      remainingStock: number;
    }
  | { outcome: 'DUPLICATE_REFUNDED'; purchase: any; paymentId: string; refund: PackRefundResult }
  | { outcome: 'SOLD_OUT_AFTER_PAYMENT'; paymentId: string; refund: PackRefundResult }
  | { outcome: 'RECORD_FAILED'; paymentId: string; refund: PackRefundResult | null };

/** Thrown inside the recording transaction to leave it (rolling back nothing) with the Purchase that is already there. */
class PackAlreadyRecorded extends Error {
  constructor(readonly purchase: any, readonly sameCharge: boolean) {
    super('pack purchase already recorded');
  }
}

/** Returns the Purchase already recorded for this attempt key, or null. Used before any money moves. */
export async function findPackReplay(db: Pick<PackCheckoutDb, 'purchase'>, txnKey: string): Promise<any | null> {
  return (await db.purchase.findFirst({ where: { clientTransactionId: txnKey } })) ?? null;
}

export async function executePackCheckout(deps: PackCheckoutDeps, input: PackCheckoutInput): Promise<PackCheckoutOutcome> {
  const { db } = deps;
  const { plan, txnKey } = input;

  // 1. Same attempt already recorded: answer with it. Nothing is charged.
  const replay = await findPackReplay(db, txnKey);
  if (replay) return { outcome: 'REPLAY', purchase: replay };

  // 2. Claim cash fee debt into the app fee, then charge. The claim is given back on every path that ends without a sale.
  const { appFeeCents, debtAppliedCents } = await deps.applyDebt({ baseAppFeeCents: input.platformFeeCents, saleAmountCents: plan.cents });
  let charge: PackChargeOk | PackChargeFail;
  try {
    charge = await deps.charge({ amountCents: plan.cents, appFeeCents, idempotencyKey: input.idempotencyKey });
  } catch (err) {
    await deps.releaseDebt(debtAppliedCents);
    throw err;
  }
  if (!charge.ok) {
    await deps.releaseDebt(debtAppliedCents);
    return { outcome: 'DECLINED', code: charge.code, message: charge.message };
  }
  const paid: PackChargeOk = charge; // const copy, so the narrowing holds inside the transaction callback below
  const paymentId = paid.paymentId;
  const attributedAffiliateLinkId = await deps.resolveAttribution().catch(() => null);

  // 3. Take the cards and write the Purchase in ONE transaction, serialized per attempt key.
  try {
    const done = await db.$transaction(
      async (tx: any) => {
        await lockBulkSaleKey(tx, `pack-attempt:${txnKey}`);
        const existing = await tx.purchase.findFirst({ where: { clientTransactionId: txnKey } });
        if (existing) throw new PackAlreadyRecorded(existing, existing.squarePaymentId === paymentId);
        const sold = await sellBulkLinesInTransaction(
          tx,
          [{ itemId: input.itemId, cards: plan.cards, cents: plan.cents, pricePerThousandCents: plan.pricePerThousandCents }],
          deps.sell
        );
        const result = sold.get(input.itemId) ?? { fullySoldOut: false, remainingStock: 0 };
        const purchase = await tx.purchase.create({
          data: {
            userId: input.buyer.userId,
            itemId: input.itemId,
            saleId: input.saleId,
            amount: plan.cents / 100,
            platformFeeAmount: appFeeCents / 100,
            cashDebtCollectedAmount: debtAppliedCents > 0 ? debtAppliedCents / 100 : undefined,
            ...snapshotFromBreakdown(input.feeBreakdown, input.feePercent, false),
            processor: 'SQUARE',
            squarePaymentId: paymentId,
            status: 'PAID',
            source: 'ONLINE',
            buyerEmail: input.buyer.email ?? undefined,
            guestName: input.buyer.name ?? undefined,
            buyerCardFingerprint: paid.cardFingerprint ?? undefined,
            deliveryMethod: 'LOCAL_PICKUP',
            affiliateLinkId: attributedAffiliateLinkId ?? undefined,
            bulkQuantity: plan.cards,
            clientTransactionId: txnKey,
          },
        });
        return { purchase, result };
      },
      { timeout: 30000, maxWait: 10000 }
    );
    return {
      outcome: 'RECORDED',
      purchase: done.purchase,
      paymentId,
      cardFingerprint: paid.cardFingerprint,
      debtAppliedCents,
      appFeeCents,
      attributedAffiliateLinkId,
      fullySoldOut: done.result.fullySoldOut,
      remainingStock: done.result.remainingStock,
    };
  } catch (err) {
    if (err instanceof PackAlreadyRecorded) {
      await deps.releaseDebt(debtAppliedCents);
      if (err.sameCharge) return { outcome: 'REPLAY', purchase: err.purchase };
      const refund = await deps.refund({ paymentId, amountCents: plan.cents, reason: 'DUPLICATE' });
      return { outcome: 'DUPLICATE_REFUNDED', purchase: err.purchase, paymentId, refund };
    }
    if (isBulkLotError(err)) {
      await deps.releaseDebt(debtAppliedCents);
      const refund = await deps.refund({ paymentId, amountCents: plan.cents, reason: 'SOLD_OUT' });
      return { outcome: 'SOLD_OUT_AFTER_PAYMENT', paymentId, refund };
    }
    deps.captureError(err, { itemId: input.itemId, saleId: input.saleId, squarePaymentId: paymentId, txnKey });
    // Did the transaction commit before it threw? Read back by payment id.
    let verified = false;
    let found: any = null;
    try {
      found = await db.purchase.findFirst({ where: { squarePaymentId: paymentId, clientTransactionId: txnKey } });
      verified = true;
    } catch {
      verified = false;
    }
    if (verified && found) return { outcome: 'REPLAY', purchase: found, commitRecovered: true };
    if (verified) {
      await deps.releaseDebt(debtAppliedCents);
      const refund = await deps.refund({ paymentId, amountCents: plan.cents, reason: 'RECORD_FAILED' });
      return { outcome: 'RECORD_FAILED', paymentId, refund };
    }
    return { outcome: 'RECORD_FAILED', paymentId, refund: null };
  }
}
