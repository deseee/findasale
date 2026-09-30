import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getPlatformFeeRate, getInclusivePlatformFeeRate, MINIMUM_TRANSACTION_FEE_CENTS, SubscriptionTier } from '../utils/feeCalculator';

/**
 * ── CASH / OFF-PLATFORM COMMISSION ACCRUAL ───────────────────────────────────────────────
 *
 * FindA.Sale charges the organizer commission (10% SIMPLE / 8% PRO+TEAMS -- see
 * utils/feeCalculator.ts, the source of truth) on EVERY sale, including sales the platform's
 * Stripe account never touches. On a card sale Stripe collects that commission for us as
 * `application_fee_amount`. On a CASH / in-person sale the organizer physically pockets the
 * whole amount, so there is nothing for Stripe to take a cut of -- the commission instead
 * accrues to `Organizer.cashFeeBalance` and is netted out of their next Stripe payout
 * (controllers/payoutController.ts: deducted at `requestPayout`, the payout is refused when
 * the balance exceeds it, and the balance is zeroed once the payout succeeds).
 *
 * WHY THIS FILE EXISTS (2026-08-17): that accrual was implemented INLINE inside
 * terminalController.processCashSaleCore and nowhere else. The markSold settlement router's
 * RECORD mode (controllers/reservationController.ts) -- the OTHER cash path, and the one an
 * organizer reaches from the holds screen -- wrote `platformFeeAmount: 0` on the Purchase and
 * never touched `cashFeeBalance` at all, so FindA.Sale earned exactly nothing on every cash
 * sale settled that way. Two implementations of "what does a cash sale owe" could not stay in
 * sync because there was only ever one. Now there is one, here, and both call it.
 *
 * DO NOT hardcode 0.10 (or any rate) at a call site. Resolve it through
 * `resolveCashCommissionRate` so a cash sale is charged the same way a card sale in the same
 * controller is.
 */

/**
 * Prisma v5: `prisma` is $extends-wrapped, so the client handed to an interactive
 * `$transaction(cb)` callback is the EXTENDED transaction flavour, which is not assignable to
 * the plain `Prisma.TransactionClient`. Accept either -- same pattern and same reasoning as
 * services/itemStockService.ts's `SellItemUnitsTx`.
 */
export type CashFeeClient =
  | Prisma.TransactionClient
  | Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

/** Round to cents. Money is stored as Float on Purchase/Organizer; never let a rate product
 *  reach the database at full binary precision. */
export const roundMoney = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

/** The organizer fields the rate resolution needs. Both are already selected by
 *  `utils/posAuth.resolveOrganizerOrTeamMember` and present on a full Organizer row. */
export interface CashCommissionOrganizer {
  subscriptionTier: string | null;
  /** Optional: callers that did not select it simply get no referral discount applied, which
   *  is the pre-existing behaviour of the Terminal cash path. */
  referralDiscountExpiry?: Date | null;
}

/**
 * THE rate a cash / off-platform sale is charged at, resolved exactly the way every other
 * charge path in this codebase resolves it:
 *
 *   1. An active referral discount zeroes the commission (mirrors terminalController's card
 *      path, `hasReferralDiscount ? 0 : baseFeeRate`).
 *   2. Otherwise the organizer's tier rate from utils/feeCalculator.
 *
 * FEE-PRECEDENCE FIX (2026-08-22): step 2 used to be "the global `FeeStructure` override row
 * (`listingType: '*'`)", checked BEFORE the tier rate, with the tier rate only as a fallback.
 * Every `FeeStructure` row in production is `listingType='*'`, `feeRate=0.1` (10/10 rows,
 * confirmed by live query), so that order pinned EVERY organizer -- PRO and TEAMS included --
 * to the 10% SIMPLE rate on every charge path that used this convention (this function,
 * stripeController.createPaymentIntent, terminalController's card path, jobs/auctionJob and
 * services/nativeShippingSuggestionService), silently overcharging PRO/TEAMS organizers 10%
 * instead of their contractual 8%. A wildcard row is meant to be a platform-wide FALLBACK
 * default, not an override -- it must never outrank a resolvable tier rate. Fixed here (and at
 * the four other call sites listed above) by dropping the `FeeStructure` read entirely: the
 * tier rate from `getPlatformFeeRate` is always resolvable (defaults to SIMPLE for a null
 * tier), so there was never a legitimate case for the wildcard row to apply. The `FeeStructure`
 * table and its rows are untouched -- this is a code-precedence fix, not a data change.
 */
export async function resolveCashCommissionRate(
  organizer: CashCommissionOrganizer,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for call-site/signature
  // compatibility (transactional callers may still want to pass their tx client in future);
  // no longer used since the FeeStructure read was removed by the fee-precedence fix above.
  tx?: CashFeeClient
): Promise<number> {
  const hasReferralDiscount =
    organizer.referralDiscountExpiry != null && organizer.referralDiscountExpiry > new Date();
  if (hasReferralDiscount) return 0;

  // Inclusive-fee-model migration (Patrick ruling, 2026-09-24): cash is by definition an
  // in-person transaction -- there is no such thing as remote/online cash -- so every cash
  // sale in the app, whichever controller records it, now resolves the IN_PERSON inclusive
  // rate rather than the old flat 10%/8%. See utils/feeCalculator.ts's inclusive-fee-model
  // header comment for what this does and does not touch.
  return getInclusivePlatformFeeRate(organizer.subscriptionTier as SubscriptionTier, 'IN_PERSON');
}

/** The commission owed on one line's amount, in dollars, rounded to cents. Floored at
 *  MINIMUM_TRANSACTION_FEE_CENTS whenever `rate` is positive (2026-09-24) -- a rate of
 *  exactly 0 (referral discount) is left at $0, never floored up. */
export const cashCommissionOn = (amount: number, rate: number): number => {
  if (!(rate > 0)) return 0;
  const raw = roundMoney((Number(amount) || 0) * rate);
  return Math.max(raw, MINIMUM_TRANSACTION_FEE_CENTS / 100);
};

/**
 * ── CASH-FEE EXPOSURE CAP (Patrick ruling, 2026-09-24, findasale-hacker P1) ────────────────
 * Uncollected cashFeeBalance is already opportunistically recouped from the organizer's next
 * Square card sale (applyCashDebtToAppFee above) -- but an organizer who never runs another
 * card sale can otherwise carry that debt indefinitely. This caps the exposure: once
 * cashFeeBalance would cross the cap, no FURTHER cash sale is allowed to accrue debt on top
 * of it until the balance is brought back under the cap (by a card sale recouping it, or a
 * manual adjustment). Callers check this BEFORE accepting a new cash amount, not after.
 */
export const CASH_FEE_EXPOSURE_CAP_CENTS = 10000; // $100.00

/** True when accruing `commission` more dollars of cash-fee debt would put this organizer's
 *  cashFeeBalance at or over the cap. Callers should block the cash leg and ask the organizer
 *  to settle (via a card sale) before accepting more cash. */
export async function wouldExceedCashFeeExposureCap(params: {
  organizerId: string;
  commission: number;
  /** Pass the caller's transaction client to run the read inside it (createPaymentRequest does,
   *  inside its SERIALIZABLE tx, so two concurrent split requests cannot both slip under the cap). */
  tx?: CashFeeClient;
  /** Default true (2026-09-29): also count split cash that is committed but not yet accrued
   *  (see getPendingSplitCashCommission). Only pass false to reproduce the old balance-only read. */
  includePending?: boolean;
}): Promise<boolean> {
  if (!(params.commission > 0)) return false;
  const client = (params.tx ?? prisma) as Prisma.TransactionClient;
  const organizer = await client.organizer.findUnique({
    where: { id: params.organizerId },
    select: { cashFeeBalance: true, subscriptionTier: true, referralDiscountExpiry: true },
  });
  const currentCents = Math.round((organizer?.cashFeeBalance ?? 0) * 100);
  let pendingCents = 0;
  if (params.includePending !== false && organizer) {
    const rate = await resolveCashCommissionRate({
      subscriptionTier: organizer.subscriptionTier,
      referralDiscountExpiry: organizer.referralDiscountExpiry,
    });
    pendingCents = Math.round(
      (await getPendingSplitCashCommission({ organizerId: params.organizerId, rate, tx: params.tx })) * 100
    );
  }
  const afterCents = currentCents + pendingCents + Math.round(params.commission * 100);
  return afterCents > CASH_FEE_EXPOSURE_CAP_CENTS;
}

/**
 * Add `commission` dollars to the organizer's running cash-fee balance and stamp the
 * "as of" timestamp payoutController's 30-day staleness warning reads.
 *
 * Pass the transaction client when the caller is inside one: the accrual then commits or rolls
 * back atomically with the Purchase rows it belongs to, so a failed settlement can never leave
 * a debt behind for a sale that was not recorded.
 *
 * Returns the amount actually accrued (0 when the commission rounds to nothing, e.g. a $0 item
 * or an active referral discount) so callers can report the real number back to the organizer
 * rather than re-deriving it.
 */
export async function accrueCashFeeBalance(params: {
  organizerId: string;
  commission: number;
  tx?: CashFeeClient;
}): Promise<number> {
  const accrued = roundMoney(params.commission);
  if (!(accrued > 0)) return 0;

  const client: Prisma.TransactionClient = (params.tx ?? prisma) as Prisma.TransactionClient;
  await client.organizer.update({
    where: { id: params.organizerId },
    data: {
      cashFeeBalance: { increment: accrued },
      cashFeeBalanceUpdatedAt: new Date(),
    },
  });
  return accrued;
}

/**
 * ── CASH-FEE-DEBT COLLECTION (2026-09-12, Stripe removal) ───────────────────────────────────
 *
 * Square has no on-demand-payout API, so the old collection mechanism (deduct accrued
 * `cashFeeBalance` from a manually-requested Stripe payout -- payoutController.ts's removed
 * `createPayout` stripe.payouts.create branch) has no direct Square equivalent. The
 * replacement: recoup the debt opportunistically from the SAME organizer's own next Square
 * CARD sale, by padding that charge's `appFeeMoney` (the platform's own cut) above the sale's
 * normal commission. Square already routes `appFeeMoney` straight to the platform's own Square
 * account at charge time (see utils/square.ts / squarePaymentService.ts) -- this is the ONLY
 * point in the whole Square integration where money the platform is entitled to actually moves
 * through the platform's hands, so it is the only place a real "collection" can happen.
 *
 * Two-phase, mirroring every other charge-then-record pattern in this codebase (compute the
 * fee, attempt the charge, only mutate the DB once the charge is CONFIRMED to have succeeded):
 *
 *   1. `applyCashDebtToAppFee` -- PRE-CHARGE. Pure computation, no DB write. Call this after
 *      computing a card sale's normal `platformFeeAmount`/appFeeCents, before sending the
 *      charge to Square. Returns the (possibly larger) appFeeCents to actually request, capped
 *      so it can never exceed the sale's own total (never push a buyer's charge into "seller
 *      gets $0 AND platform takes more than the sale is worth").
 *
 *   2. `settleCashDebtCollection` -- POST-CHARGE, only once Square has confirmed the payment
 *      succeeded. Decrements `cashFeeBalance` by exactly the amount actually applied. Guarded
 *      (`cashFeeBalance: { gte: debtCents/100 }`) the same way refundService.ts /
 *      squareRefundService.ts guard their own decrements, so a race with a concurrent
 *      settlement can never drive the balance negative -- worst case is a small under-collection
 *      corrected on the organizer's next card sale, never an over-collection.
 *
 * Callers MUST persist the returned `debtAppliedCents` from step 1 onto the created Purchase
 * row's `cashDebtCollectedAmount` (dollars) so a later refund of that specific purchase can
 * reverse exactly this amount back onto `cashFeeBalance` -- see squareRefundService.ts. Do not
 * fold the debt into `commissionAmount`/`commissionRate`: those must keep reporting this sale's
 * OWN true rate for organizer-facing fee reporting (utils/feeCalculator.resolveOrganizerFeeReport),
 * per the FEE SNAPSHOT invariant on the Purchase model.
 */

/** Cents of outstanding cashFeeBalance that can safely ride on top of `baseAppFeeCents` for a
 *  card sale of `saleAmountCents`, without exceeding the sale's own total. Never negative. */
export function computeCashDebtRoomCents(params: {
  cashFeeBalance: number;
  baseAppFeeCents: number;
  saleAmountCents: number;
}): number {
  const outstandingCents = Math.round((Number(params.cashFeeBalance) || 0) * 100);
  if (outstandingCents <= 0) return 0;
  const room = params.saleAmountCents - params.baseAppFeeCents;
  if (!(room > 0)) return 0;
  return Math.min(outstandingCents, room);
}

/**
 * PRE-CHARGE. Reads the organizer's current `cashFeeBalance` and returns the appFeeCents to
 * actually charge (base commission + whatever debt fits). No DB write -- see file-header note.
 * `debtAppliedCents` is what the caller must pass to `settleCashDebtCollection` AFTER a
 * confirmed-successful charge, and must persist as `cashDebtCollectedAmount` on the Purchase row.
 */
export async function applyCashDebtToAppFee(params: {
  organizerId: string;
  baseAppFeeCents: number;
  saleAmountCents: number;
  tx?: CashFeeClient;
}): Promise<{ appFeeCents: number; debtAppliedCents: number }> {
  const client = (params.tx ?? prisma) as Prisma.TransactionClient;
  const organizer = await client.organizer.findUnique({
    where: { id: params.organizerId },
    select: { cashFeeBalance: true },
  });
  const debtAppliedCents = computeCashDebtRoomCents({
    cashFeeBalance: organizer?.cashFeeBalance ?? 0,
    baseAppFeeCents: params.baseAppFeeCents,
    saleAmountCents: params.saleAmountCents,
  });
  return { appFeeCents: params.baseAppFeeCents + debtAppliedCents, debtAppliedCents };
}

/**
 * POST-CHARGE. Call ONLY after Square has confirmed the charge succeeded, with the exact
 * `debtAppliedCents` returned by `applyCashDebtToAppFee` for that same charge. No-op when 0.
 */
export async function settleCashDebtCollection(params: {
  organizerId: string;
  debtAppliedCents: number;
  tx?: CashFeeClient;
}): Promise<void> {
  if (!(params.debtAppliedCents > 0)) return;
  const collected = roundMoney(params.debtAppliedCents / 100);
  const client: Prisma.TransactionClient = (params.tx ?? prisma) as Prisma.TransactionClient;
  await client.organizer.updateMany({
    where: { id: params.organizerId, cashFeeBalance: { gte: collected } },
    data: {
      cashFeeBalance: { decrement: collected },
      cashFeeBalanceUpdatedAt: new Date(),
    },
  });
}

/**
 * ── SPLIT-TENDER SUPPORT (2026-09-29) ───────────────────────────────────────────────────────
 * Everything below serves the cash+card split-tender flow (ADR-split-payment-S422: the fee is
 * charged on the CARD leg only, one card charge for the card amount, cash + card = total).
 */

/** Upper bound on any single POS amount in cents ($100,000.00). Rejects garbage/overflow input
 *  with a 400 instead of letting it reach Square or the database as a 500. */
export const MAX_POS_AMOUNT_CENTS = 10_000_000;

/**
 * Smallest card charge the POS will send to Square, in cents. UNKNOWN AS A CONFIRMED SQUARE
 * LIMIT: no Square minimum is documented anywhere in this repo, so this reuses the only
 * precedent that is (squarePaymentController.ts rejects an item below $0.50 with "Item price
 * must be at least $0.50 to process payment"). Raise it here, in one place, if Square rejects
 * anything larger in live use.
 */
export const MIN_SPLIT_CARD_LEG_CENTS = 50;

/**
 * Square refuses a payment whose application fee is (nearly) the whole amount. FindA.Sale's
 * per-transaction minimum fee ($0.75, feeCalculator.MINIMUM_TRANSACTION_FEE_CENTS) can exceed a
 * very small card leg, so the card leg must also leave the fee at or under this share of itself.
 * 90% is Square's published app_fee_money ceiling as best as is known (NOT independently
 * verified against live docs in this session; it is deliberately conservative -- a stricter-than-
 * necessary check only asks the cashier to collect a little more cash, never mischarges).
 */
export const MAX_APP_FEE_SHARE_OF_CARD_LEG = 0.9;

const dollars = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

/** True for a finite whole-number cents value in (0, max]. The type guard is what lets callers
 *  use the value as a number afterwards. */
export const isValidCents = (value: unknown, max: number = MAX_POS_AMOUNT_CENTS): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= max;

export type SplitTenderCheck =
  | { ok: true }
  | { ok: false; status: 400; code: string; message: string };

/**
 * Validates a cash+card split: all three amounts whole positive cents within bounds, and
 * cash + card === total EXACTLY. The +-1 cent tolerance the old check allowed is gone: every
 * client computes card = total - cash in integer cents (pos.tsx), so there is no rounding
 * source left that a tolerance could legitimately be absorbing, and a tolerance would let the
 * cash leg and card leg silently disagree with the recorded total by a cent.
 */
export function validateSplitTender(p: { totalCents: unknown; cashCents: unknown; cardCents: unknown }): SplitTenderCheck {
  if (!isValidCents(p.totalCents) || !isValidCents(p.cashCents) || !isValidCents(p.cardCents)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_SPLIT_AMOUNT',
      message: `Total, cash and card amounts must each be whole cents greater than 0 and at most ${dollars(MAX_POS_AMOUNT_CENTS)}.`,
    };
  }
  if (p.cashCents + p.cardCents !== p.totalCents) {
    return {
      ok: false,
      status: 400,
      code: 'SPLIT_SUM_MISMATCH',
      message: `Split amounts must add up exactly to the total. Got ${p.cashCents} + ${p.cardCents} = ${p.cashCents + p.cardCents}, expected ${p.totalCents} (cents).`,
    };
  }
  return { ok: true };
}

/**
 * Cashier-facing reason a card charge of `cardCents` cannot be sent to Square, or null when it
 * can. `appFeeCents` is the platform fee that will ride on that charge. `isSplit` only changes
 * the wording of the suggested way out (collect more cash vs take the sale in cash).
 */
export function cardLegProblem(p: { cardCents: number; appFeeCents: number; isSplit: boolean }): string | null {
  const way = p.isSplit
    ? 'Collect more of this sale in cash, or take the whole sale in cash.'
    : 'Take this sale in cash instead.';
  if (p.cardCents < MIN_SPLIT_CARD_LEG_CENTS) {
    return `The card amount (${dollars(p.cardCents)}) is below the ${dollars(MIN_SPLIT_CARD_LEG_CENTS)} minimum a card can be charged. ${way}`;
  }
  if (p.appFeeCents > Math.floor(p.cardCents * MAX_APP_FEE_SHARE_OF_CARD_LEG)) {
    return `The card amount (${dollars(p.cardCents)}) is too small to cover the ${dollars(p.appFeeCents)} minimum platform fee. ${way}`;
  }
  return null;
}

/**
 * Commission (dollars) on split cash that has been committed but is NOT yet in
 * Organizer.cashFeeBalance, so the exposure cap can see it (2026-09-29 fix: the cap used to read
 * only the accrued balance, so several split requests could be created back to back, each under
 * the cap on its own, and together blow past it once they were all paid).
 *
 * Counts: split POSPaymentRequests still awaiting payment (PENDING and unexpired, or ACCEPTED --
 * confirm does not re-check expiry), and split POSPaymentLinks that are ACTIVE and unexpired, or
 * COMPLETED in the last 7 days with no CashFeeAccrual ledger row yet (paid, not yet accrued).
 * Requests that are PAID are excluded: confirmPaymentRequest accrues in the same transaction that
 * flips them to PAID, so their fee is already in the balance.
 */
export async function getPendingSplitCashCommission(params: {
  organizerId: string;
  rate: number;
  tx?: CashFeeClient;
  /** Leave one request out (a caller re-checking a request it already inserted). */
  excludeRequestId?: string;
}): Promise<number> {
  if (!(params.rate > 0)) return 0;
  const client = (params.tx ?? prisma) as Prisma.TransactionClient;
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const requests = await client.pOSPaymentRequest.findMany({
    where: {
      organizerId: params.organizerId,
      isSplitPayment: true,
      ...(params.excludeRequestId ? { id: { not: params.excludeRequestId } } : {}),
      OR: [{ status: 'ACCEPTED' }, { status: 'PENDING', expiresAt: { gt: now } }],
    },
    select: { cashAmountCents: true },
  });

  const links = await client.pOSPaymentLink.findMany({
    where: {
      organizerId: params.organizerId,
      isSplitPayment: true,
      OR: [
        { status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        { status: 'COMPLETED', completedAt: { gt: weekAgo } },
      ],
    },
    select: { id: true, status: true, cashAmountCents: true },
  });
  const completedIds = links.filter((l) => l.status === 'COMPLETED').map((l) => l.id);
  const accruedIds = new Set<string>();
  if (completedIds.length > 0) {
    const ledger = await client.cashFeeAccrual.findMany({
      where: { sourceType: 'POS_PAYMENT_LINK', sourceId: { in: completedIds } },
      select: { sourceId: true },
    });
    for (const row of ledger) accruedIds.add(row.sourceId);
  }

  let total = 0;
  for (const r of requests) {
    if (r.cashAmountCents && r.cashAmountCents > 0) total += cashCommissionOn(r.cashAmountCents / 100, params.rate);
  }
  for (const l of links) {
    if (l.status === 'COMPLETED' && accruedIds.has(l.id)) continue;
    if (l.cashAmountCents && l.cashAmountCents > 0) total += cashCommissionOn(l.cashAmountCents / 100, params.rate);
  }
  return roundMoney(total);
}

// 'HOLD_INVOICE' (2026-09-29): sourceId = HoldInvoice.id, written by holdInvoicePaymentRecorder for a hold invoice with a cash leg.
export type CashFeeAccrualSource = 'POS_PAYMENT_REQUEST' | 'POS_PAYMENT_LINK' | 'MANUAL_CARD' | 'HOLD_INVOICE';

/**
 * IDEMPOTENT cash-leg commission accrual. Inserts the (sourceType, sourceId) ledger row and, only
 * if that insert actually created a row, increments Organizer.cashFeeBalance -- both in one
 * transaction (the caller's when `tx` is passed, otherwise its own). A replay, a webhook
 * redelivery or a heal-on-read call therefore accrues exactly once.
 *
 * Uses createMany({ skipDuplicates: true }) (INSERT ... ON CONFLICT DO NOTHING), NOT a
 * create-and-catch-P2002: inside a Postgres transaction a failed statement poisons the whole
 * transaction, so catching a unique violation would abort the caller's PAID transition too.
 *
 * A commission that rounds to 0 (referral discount) records nothing and returns accrued 0.
 * Throws on a real DB failure -- callers decide whether that aborts their transaction
 * (confirmPaymentRequest) or is alerted and left to the reconciliation query (manual card).
 */
export async function accrueCashFeeOnce(params: {
  organizerId: string;
  sourceType: CashFeeAccrualSource;
  sourceId: string;
  cashAmountCents: number;
  /** Commission in dollars, already rounded (cashCommissionOn's output). */
  commission: number;
  tx?: CashFeeClient;
}): Promise<{ accrued: number; duplicate: boolean }> {
  const commissionCents = Math.round(roundMoney(params.commission) * 100);
  if (!(commissionCents > 0)) return { accrued: 0, duplicate: false };

  const run = async (client: Prisma.TransactionClient) => {
    const created = await client.cashFeeAccrual.createMany({
      data: [
        {
          organizerId: params.organizerId,
          sourceType: params.sourceType,
          sourceId: params.sourceId,
          cashAmountCents: params.cashAmountCents,
          commissionCents,
        },
      ],
      skipDuplicates: true,
    });
    if (created.count === 0) return { accrued: 0, duplicate: true };
    await accrueCashFeeBalance({ organizerId: params.organizerId, commission: commissionCents / 100, tx: client });
    return { accrued: commissionCents / 100, duplicate: false };
  };

  if (params.tx) return run(params.tx as Prisma.TransactionClient);
  return prisma.$transaction(async (tx) => run(tx as unknown as Prisma.TransactionClient));
}

/**
 * Resolve the tier/referral-aware cash rate and accrue a split sale's cash leg once. This is the
 * one call every "a split sale was just paid" site makes (confirmPaymentRequest, the manual card
 * charge, the QR payment-link heal, and posPaymentLinkRecorder once it is wired -- see the
 * hand-off note). Returns the dollars actually accrued this call (0 on a duplicate).
 */
export async function accrueSplitCashLegOnce(params: {
  organizer: { id: string; subscriptionTier: string | null; referralDiscountExpiry?: Date | null };
  sourceType: CashFeeAccrualSource;
  sourceId: string;
  cashAmountCents: number;
  tx?: CashFeeClient;
}): Promise<{ accrued: number; duplicate: boolean }> {
  const rate = await resolveCashCommissionRate({
    subscriptionTier: params.organizer.subscriptionTier,
    referralDiscountExpiry: params.organizer.referralDiscountExpiry ?? null,
  });
  return accrueCashFeeOnce({
    organizerId: params.organizer.id,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    cashAmountCents: params.cashAmountCents,
    commission: cashCommissionOn(params.cashAmountCents / 100, rate),
    tx: params.tx,
  });
}

/**
 * Split `totalCents` across rows in proportion to `weightsCents`, in whole cents, summing to
 * EXACTLY `totalCents`. Largest-remainder method (2026-09-29, money review P2): every row first
 * gets floor(total * w / sumW), then the leftover cents (always fewer than the number of rows
 * with a positive weight) go one each to the rows with the largest fractional remainders. Because
 * only rows with a positive weight can have a fractional remainder, a zero (or negative) weight
 * row ALWAYS gets 0 and the shares always sum exactly, with each row within 1 cent of its exact
 * proportional share. The previous scheme dumped the whole rounding residual on the LAST row even
 * when that row had zero weight, and could drift it by up to k/2 cents.
 *
 * All arithmetic is on integers (quotient and remainder, no float floor of a division), so a share
 * can never be off by one from float rounding. Ties on the remainder go to the larger weight, then
 * the earlier row, so the result is deterministic. Returns all zeros when there is nothing to
 * allocate (non-positive total or no positive weights).
 */
export function allocateCentsProportionally(totalCents: number, weightsCents: number[]): number[] {
  const weights = weightsCents.map((w) => (Number.isFinite(w) && w > 0 ? Math.round(w) : 0));
  const total = Number.isFinite(totalCents) ? Math.round(totalCents) : 0;
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (!(total > 0) || !(sumW > 0)) return weightsCents.map(() => 0);

  const shares: number[] = [];
  const remainders: number[] = [];
  for (const w of weights) {
    if (w === 0) {
      shares.push(0);
      remainders.push(-1);
      continue;
    }
    const numerator = total * w;
    let q = Math.floor(numerator / sumW);
    let r = numerator - q * sumW;
    while (r < 0) {
      q -= 1;
      r += sumW;
    }
    while (r >= sumW) {
      q += 1;
      r -= sumW;
    }
    shares.push(q);
    remainders.push(r);
  }

  let leftover = total - shares.reduce((a, b) => a + b, 0);
  if (leftover > 0) {
    const order = weights
      .map((w, idx) => idx)
      .filter((idx) => weights[idx] > 0)
      .sort((a, b) => remainders[b] - remainders[a] || weights[b] - weights[a] || a - b);
    for (let i = 0; leftover > 0 && order.length > 0; i = (i + 1) % order.length) {
      shares[order[i]] += 1;
      leftover -= 1;
    }
  }
  return shares;
}

export interface SplitRefundResolution {
  /** True when the purchase row carries a cash leg. */
  isSplit: boolean;
  /** Dollars of the purchase the processor actually captured (amount - cashLegAmount). */
  cardCollectedAmount: number;
  /** Dollars to send to the processor refund call (never more than it captured). */
  processorRefundAmount: number;
  /** Dollars the organizer must hand back in cash (the part the processor cannot refund). */
  cashPortionToRefundByHand: number;
  /** Organizer-facing sentence for the refund response / UI, or null when nothing is owed by hand. */
  message: string | null;
}

/**
 * Refund scope for a split-tender purchase (industry standard: the processor refunds only what it
 * collected; the cash leg is refunded by the merchant in cash and recorded as a manual refund).
 * `requestedRefund` is dollars, already validated by the caller as > 0 and <= purchase.amount.
 * Card-first: the processor refund is min(requested, card collected), so a partial refund that
 * fits inside the card leg is entirely processor-side and only a refund reaching into the cash leg
 * leaves a hand-back amount. A non-split purchase passes straight through unchanged.
 */
export function resolveSplitRefund(
  purchase: { amount: number; cashLegAmount?: number | null },
  requestedRefund: number,
  /**
   * Refunds already issued on this purchase (2026-09-29, partial refunds keep the purchase PAID so a
   * second one is possible). `refundedAmount` is the cumulative value returned so far and
   * `refundCashPortion` the part of it handed back in cash, so the card leg still refundable is
   * cardCollected - (refundedAmount - refundCashPortion). Omitted or zero: first refund, unchanged.
   */
  prior?: { refundedAmount?: number | null; refundCashPortion?: number | null }
): SplitRefundResolution {
  const cashLeg = roundMoney(Number(purchase.cashLegAmount) || 0);
  if (!(cashLeg > 0)) {
    return {
      isSplit: false,
      cardCollectedAmount: roundMoney(purchase.amount),
      processorRefundAmount: roundMoney(requestedRefund),
      cashPortionToRefundByHand: 0,
      message: null,
    };
  }
  const cardCollected = Math.max(0, roundMoney(purchase.amount - cashLeg));
  const priorRefunded = Math.max(0, Number(prior?.refundedAmount) || 0);
  const priorCash = Math.min(priorRefunded, Math.max(0, Number(prior?.refundCashPortion) || 0));
  const priorProcessor = roundMoney(priorRefunded - priorCash);
  const cardRemaining = Math.max(0, roundMoney(cardCollected - priorProcessor));
  const processorRefund = roundMoney(Math.min(requestedRefund, cardRemaining));
  const cashByHand = roundMoney(requestedRefund - processorRefund);
  const fmt = (n: number) => `$${n.toFixed(2)}`;
  return {
    isSplit: true,
    cardCollectedAmount: cardCollected,
    processorRefundAmount: processorRefund,
    cashPortionToRefundByHand: cashByHand,
    message:
      cashByHand > 0
        ? `Cash portion to refund by hand: ${fmt(cashByHand)}. ${fmt(processorRefund)} was refunded to the card. ${fmt(cashByHand)} of this sale was paid in cash and never went through the card processor, so hand that amount back to the shopper in cash and record it as a manual cash refund.`
        : null,
  };
}
