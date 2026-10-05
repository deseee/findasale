import * as Sentry from '@sentry/node';
import { prisma } from '../lib/prisma';
import { getIO } from '../lib/socket';
import { pushEvent } from '../services/liveFeedService';
import { sellItemUnits, InsufficientStockError } from '../services/itemStockService'; // ADR-085 Track B Phase 1 Step 4
import { endEbayListingIfExists } from '../controllers/ebayController';
import { markShopifyItemSold } from '../services/shopifyService';
import { withdrawDiscogsListingIfExists } from '../services/marketplace/discogsListingConnector';
import { withdrawReverbListingIfExists } from '../services/marketplace/reverbConnector'; // 2026-09-23: withdraw Reverb listing on SOLD, beside Discogs
import { notifyFacebookExportedItemSold } from '../services/facebookNudgeService';
import { syncMarketplaceStock } from '../services/marketplaceStockSyncService';
import { transactionalEmailService } from '../lib/transactionalEmailService';
import { shouldUseDirectCharge } from './stripeConnectService'; // Purchase-row backfill (2026-08-09): recompute chargeType at payment-confirmation time, mirrors posPaymentLinkRecorder.ts
import { accrueSplitCashLegOnce, allocateCentsProportionally } from './cashFeeService'; // 2026-09-29: cash-leg commission now accrues through the exactly-once CashFeeAccrual ledger (sourceType 'HOLD_INVOICE'), and per-row amounts/fees/cash legs are allocated in exact cents; mirrors posPaymentLinkRecorder.ts
// 2026-09-29 money review P0-2: a captured Square payment on a dead invoice is recorded (items still available) or refunded, never left unresolved. The refund service is imported LAZILY (see refundOrEscalateDeadSquarePayment): it pulls in the Square token/crypto chain, which must not load for every caller of this recorder (Stripe webhook, tests) that never refunds.
import { computeOversoldSettlement, settleOversoldPayment, notifyOversoldSettlement, type OversoldSettlement } from './oversoldPaymentRefundService'; // 2026-09-30 payment review finding 2: a paid item that could not be fulfilled (oversold) is refunded by its card share instead of only raising an alert
import { findBulkLotItemIds } from './bulkLot/bulkLotService'; // ADR-136 Addendum B (#659): a bulk lot on a hold invoice is paid by the cards held for it, never sold as one unit
import { isBulkLotsEnabled } from './bulkLot/bulkLotConfig';
import { fireSquarePurchaseEngagement } from './squarePurchaseEngagementService'; // 2026-09-29 Sale Passport wiring: purchase XP, milestones, referral, badge, achievement and passport stamp for a Square-paid invoice (idempotent per payment, never throws)

/**
 * holdInvoicePaymentRecorder.ts — payments fix (2026-08-03)
 *
 * PROBLEM: HoldInvoice Stripe payments could get stranded PENDING forever. The
 * `charge.succeeded` webhook (stripeController.ts) keys off
 * `paymentIntent.metadata.invoiceId`, but neither createCombinedInvoice
 * (posController.ts) nor markSoldAndCreateInvoice (reservationController.ts) ever
 * backfilled that metadata key onto the PaymentIntent after creating the HoldInvoice
 * row -- the HoldInvoice ID doesn't exist yet when the Stripe Checkout Session is
 * first created. Fix ships in two parts:
 *   1. Both invoice-creation controllers now backfill the PaymentIntent metadata
 *      with `invoiceId` right after the HoldInvoice row is created (non-fatal --
 *      the webhook is the fast path once this lands).
 *   2. This file is the single source of truth for RECORDING a HoldInvoice as paid:
 *      flips HoldInvoice.status, confirms bundled ItemReservations, marks bundled
 *      Items SOLD, fires cross-channel removal hooks, awards shopper XP, emits the
 *      live-feed socket event, and sends confirmation emails. Reused by BOTH the
 *      Stripe `charge.succeeded` webhook handler (fast path -- metadata now present
 *      going forward) AND invoiceExpiryJob's STRANDED-PAID reconciliation branch
 *      (backstop -- catches any invoice whose webhook never fired, including ones
 *      created before this fix shipped), so the two callers can never diverge.
 *      Mirrors posPaymentLinkRecorder.ts's proven fast-path-plus-backstop pattern.
 *
 * Idempotency (two layers, mirrors posPaymentLinkRecorder.ts):
 *   1. Fast-path check outside any transaction: if HoldInvoice.status is already
 *      'PAID', return immediately with no work done.
 *   2. Inside the $transaction, the flip to PAID is a single guarded conditional
 *      UPDATE (WHERE status = 'PENDING') -- flip-first, so a concurrent webhook/
 *      reconcile race that both reach this point can't double-record.
 *
 * Dead-invoice guard (P0, 2026-08-17): the layer-2 guard above used to be
 * `status != 'PAID'`, which let a CANCELLED (releaseInvoice) or EXPIRED
 * (invoiceExpiryJob / charge.failed) invoice flip FORWARD to PAID when a late
 * charge.succeeded arrived -- Stripe captured real money against an invoice whose
 * items were already back on sale, and if any item had been re-sold in the interim
 * the oversold branch below excluded it from Purchase creation, leaving a captured
 * charge with NO Purchase row for refundService.executeVerifiedRefund to key off.
 * PENDING is now the only state that can flip (it is the only legitimately payable
 * state -- all three creation paths write PENDING, CANCELLED/EXPIRED are terminal,
 * REFUNDED only follows PAID), and any payment arriving on a non-PENDING,
 * non-PAID invoice records NOTHING and raises a Sentry alert
 * (reportDeadInvoicePayment) carrying the invoice id, PaymentIntent id, amount and
 * actual status so the charge can be found and refunded by hand. No automatic
 * refund is issued -- that decision is Patrick's, and is not implemented here.
 *
 * Purchase-row backfill (2026-08-09): this function previously flipped HoldInvoice/Item/
 * ItemReservation state but never created a Purchase row, so refundService.ts's
 * executeVerifiedRefund (keys off purchaseId) and stripeController.ts's
 * resolveDisputeContext (keys off Purchase.stripePaymentIntentId) could never find a
 * record for a Hold-to-Pay sale -- refunds were impossible and disputes silently fell
 * through to the platform-absorb branch even with STRIPE_DISPUTE_LIVE_CLAWBACK=true.
 * Fixed by creating one Purchase row per bundled item (mirrors posPaymentLinkRecorder.ts's
 * proven pattern) inside the SAME $transaction as the PAID flip, sourced entirely from
 * data already fetched/verified in this function (holdInvoice, bundledItems, the
 * paymentIntentId parameter). Idempotency mirrors posPaymentLinkRecorder.ts's second
 * layer: the compound partial unique index on (stripePaymentIntentId, itemId) backstops
 * the outer flip-guard above -- a P2002 on create is caught and treated as
 * already-recorded, never thrown. An item that hits InsufficientStockError in the stock
 * loop below (oversold race) is excluded from Purchase creation, matching
 * posPaymentLinkRecorder.ts's oversoldItemIds handling (a real captured payment with no
 * deliverable item is a manual-refund-review case, not a fabricated fulfillment record).
 * HoldInvoice.chargeType/stripeAccountId (2026-08-18 migration) are preferred when present --
 * pinned at checkout-session-creation time, they cannot drift. Only pre-migration rows (both
 * columns NULL) fall back to recomputing DIRECT-vs-DESTINATION via shouldUseDirectCharge
 * against the sale's organizer -- same known edge case (can only disagree with the original
 * checkout-time decision if Stripe eligibility or the allowlist changed in between) still
 * accepted for the POS Payment Link path (posPaymentLinkRecorder.ts), which has no invoice-like
 * row to pin a snapshot onto.
 *
 * DEAD-INVOICE RESOLUTION (2026-09-29, money review P0-2): the "NO automatic refund" rule above
 * is superseded for SQUARE. A Square Payment Link can still be paid after its invoice was
 * released/expired (the release paths now cancel the link first, but a payment can land inside the
 * race window or on an invoice released before that fix). When a completed Square payment arrives
 * for a CANCELLED/EXPIRED invoice this file now:
 *   1. raises the Sentry error (reportDeadInvoicePayment) AND files an organizer notification
 *      (type 'payment_reconciliation', deduped per invoice + outcome): that pair is the
 *      unresolved-reconciliation record (there is deliberately no new table);
 *   2. if every bundled item is still AVAILABLE (or the invoice has no inventory lines), REVIVES the
 *      invoice: the same guarded flip, item sale, Purchase rows and cash accrual as a normal
 *      payment, with the flip guarded on the invoice's dead status instead of PENDING. An item that
 *      is sold under us mid-transaction aborts and rolls back the whole revive;
 *   3. otherwise refunds the captured payment in full through squareDeadInvoiceRefundService
 *      (kill switch SQUARE_DEAD_INVOICE_AUTO_REFUND_DISABLED=1) and notifies the organizer and, for
 *      a real account, the shopper. A refund that is not issued leaves the Sentry error and the
 *      organizer notification as the manual-review record.
 * Stripe invoices keep the old behavior (alert, record nothing, no refund here: the hourly
 * deadInvoicePaidSweepJob owns Stripe) plus the organizer notification. A REFUNDED invoice
 * receiving a duplicate delivery is a silent no-op.
 *
 * DISCOUNTED / SPLIT-TENDER INVOICES (2026-09-29):
 *   - Crew Invasion discount: HoldInvoice.totalAmount can be BELOW the sum of the bundled items'
 *     list prices. The Purchase rows must add up to what was actually paid (refunds, earnings and
 *     disputes key off them), so when totalAmount < sum(item price cents) each row's amount is
 *     scaled by totalAmount / sum(item price cents) with allocateCentsProportionally (rows sum to
 *     the cent; the last row absorbs rounding). An invoice at or above the item sum keeps each
 *     row at the item's list price exactly as before. Rows are allocated over ALL bundled items
 *     and only sellable ones are written, so an oversold item's share is never re-attributed to
 *     the others (it stays a manual-refund case).
 *   - The platform fee (HoldInvoice.platformFeeAmount, computed on the CARD leg only) is
 *     allocated across rows in exact cents by list-price share, so per-row commissionAmount sums
 *     to the invoice fee.
 *   - Cash leg (HoldInvoice.cashAmountCents, 'pos-cash' or cash+card): each row gets
 *     Purchase.cashLegAmount (dollars, proportional to the row amount, whole cents, capped at the
 *     row) so a refund knows how much of the row the card processor never collected
 *     (cashFeeService.resolveSplitRefund). The cash-leg commission accrues through
 *     accrueSplitCashLegOnce (CashFeeAccrual, unique per ('HOLD_INVOICE', invoice id)) INSIDE this
 *     transaction, so it commits or rolls back with the PAID flip and can never double-accrue on a
 *     webhook redelivery or reconcile pass. A failure THROWS and rolls the recording back (the
 *     caller's retry re-attempts it), same as posPaymentLinkRecorder: swallowing it here would not
 *     even work, because a failed statement aborts the surrounding Postgres transaction.
 *     Refund reversal finds the accrual through cashFeeRefundReversalService (HOLD_INVOICE).
 *     REQUIRES the CashFeeAccrual table (migration 20260929120000_pos_split_tender_ledger).
 *   - Engagement: for a Square-paid invoice with a real shopper, the shared engagement service is
 *     fired after commit for the created Purchase rows (see the call site for the dedupe notes).
 */

export interface MarkHoldInvoicePaidOpts {
  // ADR-111 (2026-08-28): 'webhook-fallback' added for the stripeController.ts charge.succeeded
  // self-healing branch (stripeSessionId lookup when paymentIntent.metadata.invoiceId is missing) --
  // kept distinguishable from plain 'webhook' in logs/Sentry so fallback usage stays visible/monitorable.
  // ADR-114 (2026-08-31): 'pos-cash' added for sendHoldInvoice's fully-cash-at-register
  // path -- cash was already physically collected, so there is no Stripe payment to wait
  // for; this call records the sale immediately with paymentIntentId=null.
  source: 'webhook' | 'reconcile' | 'webhook-fallback' | 'pos-cash';
  chargeId?: string;
  /** Estimated Stripe processing fee, in cents. Defaults to 0 if not supplied. */
  stripeFeeAmountCents?: number;
}

export interface MarkHoldInvoicePaidResult {
  /** true only if THIS call performed the recording (flipped PENDING -> PAID). */
  recorded: boolean;
  /** true if the invoice was already PAID (by this call or a concurrent one). */
  alreadyPaid: boolean;
  /**
   * P0 (2026-08-17): true if a real Stripe payment arrived for an invoice that was NOT
   * payable (CANCELLED / EXPIRED / any non-PENDING, non-PAID state). Nothing was recorded
   * and NO refund was issued -- a Sentry alert was raised for manual review instead.
   * Optional so existing callers (stripeController charge.succeeded, invoiceExpiryJob's
   * reconcile branch) keep compiling unchanged.
   */
  deadInvoice?: boolean;
  /**
   * 2026-09-30 (payment review finding 2): set when this call recorded the invoice but at least one paid
   * item could not be fulfilled (oversold). The card share of those items is refunded automatically
   * (Square, kill switch SQUARE_DEAD_INVOICE_AUTO_REFUND_DISABLED); status says what happened.
   */
  oversoldSettlement?: {
    status: 'REFUNDED' | 'MANUAL' | 'NOTHING_TO_REFUND';
    refundCents: number;
    fullRefund: boolean;
    /** Cash the organizer must hand back for the oversold items (split tender / cash sale), in cents. */
    cashToReturnCents: number;
  };
}

/**
 * P0 (2026-08-17): loud, actionable alert for "Stripe captured money against an invoice
 * that was not payable". Deliberately a captureException (not captureMessage) so it lands
 * as a real issue with a stack, matching stripeController.ts's cart-checkout failure
 * handler. Carries everything needed to FIND the charge in Stripe and refund it by hand:
 * invoice id, PaymentIntent id, amount, and the invoice's actual status.
 *
 * NO automatic refund is issued from here -- moving money autonomously is out of scope and
 * requires Patrick's explicit sign-off (open decision, flagged in the handoff).
 */
function reportDeadInvoicePayment(params: {
  invoiceId: string;
  // ADR-114 (2026-08-31): nullable -- markHoldInvoicePaid's 'pos-cash' source calls with
  // paymentIntentId=null (a fully-cash invoice has no Stripe PaymentIntent at all). This
  // guard is effectively unreachable for that source in practice (the invoice was just
  // created PENDING moments earlier in the same request), but must still type-check for
  // the case where it's ever reached.
  paymentIntentId: string | null;
  invoiceStatus: string;
  amountCents: number;
  source: string;
  chargeId?: string;
  saleId?: string | null;
  shopperUserId?: string | null;
  /** 'pre-transaction' = dead on first read; 'flip-race' = went dead between read and flip. */
  detectedAt: 'pre-transaction' | 'flip-race';
}): void {
  const amountDollars = (params.amountCents / 100).toFixed(2);
  const msg =
    `[hold-invoice/${params.source}] DEAD-INVOICE-PAYMENT invoice=${params.invoiceId} ` +
    `status=${params.invoiceStatus} pi=${params.paymentIntentId} amount=$${amountDollars} ` +
    `detectedAt=${params.detectedAt} -- a payment was captured for an invoice that is not ` +
    `PENDING. Stripe: NO sale was recorded and NO refund was issued here, refund it manually in ` +
    `Stripe (deadInvoicePaidSweepJob also watches these). Square: the recorder records the sale ` +
    `if the items are still available, otherwise refunds it; see the following ` +
    `"DEAD-INVOICE resolution" log line for what was done.`;
  console.error(msg);
  try {
    Sentry.captureException(new Error(msg), {
      tags: {
        area: 'hold-invoice-dead-payment',
        invoiceStatus: params.invoiceStatus,
        source: params.source,
        detectedAt: params.detectedAt,
      },
      extra: {
        invoiceId: params.invoiceId,
        stripePaymentIntentId: params.paymentIntentId,
        chargeId: params.chargeId ?? null,
        invoiceStatus: params.invoiceStatus,
        amountCents: params.amountCents,
        amountDollars,
        saleId: params.saleId ?? null,
        shopperUserId: params.shopperUserId ?? null,
        detectedAt: params.detectedAt,
      },
    });
  } catch {
    // Sentry may not be initialized -- never let the alert path throw into the webhook
    // handler (a throw there marks the idempotency row FAILED and returns 500, which makes
    // Stripe retry forever). The console.error above is the fallback record.
  }
}

/** Thrown inside the revive transaction when an item cannot be sold, to roll the whole revive back. */
class DeadInvoiceReviveAbort extends Error {
  itemId: string;
  constructor(itemId: string) {
    super(`dead-invoice revive aborted: item ${itemId} is no longer sellable`);
    this.name = 'DeadInvoiceReviveAbort';
    this.itemId = itemId;
  }
}

/** Dead states a completed Square payment can be safely revived from. */
const REVIVABLE_DEAD_STATUSES = new Set(['CANCELLED', 'EXPIRED']);

type DeadInvoiceNotifyOutcome = 'RECORDED' | 'REFUNDED' | 'MANUAL';

const centsToDollarString = (cents: number): string => (Math.max(0, Number(cents) || 0) / 100).toFixed(2);

/**
 * The organizer-facing half of the unresolved-reconciliation record (the Sentry error is the other).
 * Best-effort and never throws. Deduped per (organizer, title, invoice id): the invoice id is in the
 * body, and a redelivered webhook or a second reconcile pass finds the row and adds nothing.
 */
async function notifyDeadInvoicePayment(params: {
  holdInvoice: any;
  outcome: DeadInvoiceNotifyOutcome;
  amountCents: number;
  detail?: string;
}): Promise<void> {
  const { holdInvoice, outcome, amountCents, detail } = params;
  const amount = centsToDollarString(amountCents);
  const ref = `Ref ${holdInvoice.id}`;
  const copy: Record<DeadInvoiceNotifyOutcome, { title: string; organizerBody: string; shopperBody: string | null }> = {
    RECORDED: {
      title: 'Late payment recorded',
      organizerBody: `A payment of $${amount} arrived after an invoice was closed. The items were still available, so the sale has been recorded. ${ref}`,
      shopperBody: null,
    },
    REFUNDED: {
      title: 'Late payment refunded',
      organizerBody: `A payment of $${amount} arrived after an invoice was closed and the items were no longer available. It has been refunded in full to the buyer. ${ref}`,
      shopperBody: `A payment of $${amount} you made after your invoice closed could not be applied because the items are no longer available. It has been refunded in full.`,
    },
    MANUAL: {
      title: 'Late payment needs review',
      organizerBody: `A payment of $${amount} arrived after an invoice was closed and could not be settled automatically${detail ? ` (${detail})` : ''}. Please review it in your Square dashboard. ${ref}`,
      shopperBody: null,
    },
  };
  const c = copy[outcome];
  const link = `/organizer/sales/${holdInvoice.saleId}`;
  try {
    const existing = await prisma.notification.findFirst({
      where: { userId: holdInvoice.organizerUserId, type: 'payment_reconciliation', title: c.title, body: { contains: holdInvoice.id } },
      select: { id: true },
    });
    if (!existing) {
      await prisma.notification.create({
        data: { userId: holdInvoice.organizerUserId, type: 'payment_reconciliation', title: c.title, body: c.organizerBody, link, channel: 'OPERATIONAL' },
      });
    }
    if (c.shopperBody && holdInvoice.shopperUserId) {
      const shopperExisting = await prisma.notification.findFirst({
        where: { userId: holdInvoice.shopperUserId, type: 'payment_refunded', body: { contains: amount }, link: `/invoices/${holdInvoice.id}` },
        select: { id: true },
      });
      if (!shopperExisting) {
        await prisma.notification.create({
          data: { userId: holdInvoice.shopperUserId, type: 'payment_refunded', title: 'Payment refunded', body: c.shopperBody, link: `/invoices/${holdInvoice.id}`, channel: 'OPERATIONAL' },
        });
      }
    }
  } catch (err) {
    console.warn(`[hold-invoice] Failed to file the late-payment notification for invoice ${holdInvoice.id}:`, err);
  }
}

/** The card-leg total a Square payment on this invoice should have captured, in cents. */
function invoiceCardLegCents(holdInvoice: any): number {
  if (typeof holdInvoice.cardAmountCents === 'number' && holdInvoice.cardAmountCents > 0) return holdInvoice.cardAmountCents;
  const cash = holdInvoice.cashAmountCents && holdInvoice.cashAmountCents > 0 ? holdInvoice.cashAmountCents : 0;
  const remainder = (holdInvoice.totalAmount ?? 0) - cash;
  return remainder > 0 ? remainder : holdInvoice.totalAmount ?? 0;
}

/**
 * Refund a captured Square payment that cannot be applied to its dead invoice, or escalate to a
 * manual-review record when the refund is not issued. Never throws.
 */
async function refundOrEscalateDeadSquarePayment(params: {
  holdInvoice: any;
  paymentId: string;
  reason: string;
}): Promise<'REFUNDED' | 'MANUAL'> {
  const { holdInvoice, paymentId, reason } = params;
  const amountCents = invoiceCardLegCents(holdInvoice);
  const organizerProfileId = holdInvoice.sale?.organizerId ?? null;
  let outcome: { refunded: boolean; reason: string; refundId?: string } = { refunded: false, reason: 'NO_ORGANIZER' };
  let autoRefundDisabled = process.env.SQUARE_DEAD_INVOICE_AUTO_REFUND_DISABLED === '1';
  if (organizerProfileId) {
    try {
      const refundService = await import('./squareDeadInvoiceRefundService');
      autoRefundDisabled = refundService.squareDeadInvoiceAutoRefundDisabled();
      outcome = await refundService.refundSquarePaymentForDeadInvoice({
        invoiceId: holdInvoice.id,
        organizerId: organizerProfileId,
        paymentId,
        expectedAmountCents: amountCents,
      });
    } catch (err: any) {
      outcome = { refunded: false, reason: `THREW: ${String(err?.message ?? err)}` };
    }
  }
  if (outcome.refunded) {
    console.error(
      `[hold-invoice] DEAD-INVOICE resolution invoice=${holdInvoice.id} payment=${paymentId} REFUNDED refund=${outcome.refundId ?? 'n/a'} (${reason})`
    );
    await notifyDeadInvoicePayment({ holdInvoice, outcome: 'REFUNDED', amountCents });
    return 'REFUNDED';
  }
  const disabled = autoRefundDisabled;
  console.error(
    `[hold-invoice] DEAD-INVOICE resolution invoice=${holdInvoice.id} payment=${paymentId} NOT REFUNDED (${outcome.reason}); manual review needed (${reason})`
  );
  try {
    Sentry.captureMessage(`[hold-invoice] dead-invoice Square payment could not be refunded automatically`, {
      level: 'error',
      tags: { area: 'hold-invoice-dead-payment', resolution: 'manual-refund-needed' },
      extra: { invoiceId: holdInvoice.id, paymentId, amountCents, reason, refundOutcome: outcome.reason, autoRefundDisabled: disabled },
    });
  } catch {
    // Sentry may not be initialized -- the console.error above is the fallback record.
  }
  await notifyDeadInvoicePayment({ holdInvoice, outcome: 'MANUAL', amountCents, detail: disabled ? 'automatic refunds are off' : undefined });
  return 'MANUAL';
}

/**
 * A payment arrived for an invoice that is not PENDING. Always raises the Sentry error. For
 * Stripe (or anything not a revivable Square case) it stops there plus a manual-review
 * notification. For a completed Square payment it decides REVIVE (caller records the sale) or
 * refunds and returns DONE.
 */
async function resolveDeadInvoicePayment(params: {
  holdInvoice: any;
  processor: 'STRIPE' | 'SQUARE';
  externalPaymentId: string | null;
  source: string;
  chargeId?: string;
  detectedAt: 'pre-transaction' | 'flip-race';
}): Promise<{ kind: 'REVIVE' } | { kind: 'DONE' }> {
  const { holdInvoice, processor, externalPaymentId, source, chargeId, detectedAt } = params;
  reportDeadInvoicePayment({
    invoiceId: holdInvoice.id,
    paymentIntentId: externalPaymentId,
    invoiceStatus: holdInvoice.status,
    amountCents: holdInvoice.totalAmount,
    source,
    chargeId,
    saleId: holdInvoice.saleId,
    shopperUserId: holdInvoice.shopperUserId,
    detectedAt,
  });

  if (processor !== 'SQUARE' || !externalPaymentId || !REVIVABLE_DEAD_STATUSES.has(holdInvoice.status)) {
    await notifyDeadInvoicePayment({
      holdInvoice,
      outcome: 'MANUAL',
      amountCents: holdInvoice.totalAmount,
      detail: processor === 'SQUARE' ? undefined : 'card payment via Stripe',
    });
    return { kind: 'DONE' };
  }

  let allAvailable = false;
  try {
    const itemIds: string[] = holdInvoice.itemIds ?? [];
    if (itemIds.length === 0) {
      allAvailable = true; // a misc-only invoice has no inventory that can conflict
    } else {
      const items = await prisma.item.findMany({
        where: { id: { in: itemIds }, saleId: holdInvoice.saleId, sale: { organizerId: holdInvoice.sale?.organizerId ?? undefined } },
        select: { id: true, status: true },
      });
      allAvailable = items.length === itemIds.length && items.every((it: any) => it.status === 'AVAILABLE');
    }
  } catch (err) {
    // Cannot tell whether the items are free. Do NOT refund on a guess: leave the manual record.
    console.error(`[hold-invoice] DEAD-INVOICE resolution invoice=${holdInvoice.id}: availability check failed:`, err);
    await notifyDeadInvoicePayment({ holdInvoice, outcome: 'MANUAL', amountCents: invoiceCardLegCents(holdInvoice), detail: 'availability check failed' });
    return { kind: 'DONE' };
  }

  if (allAvailable) {
    console.error(
      `[hold-invoice] DEAD-INVOICE resolution invoice=${holdInvoice.id} payment=${externalPaymentId} REVIVING (items still available, recording the sale)`
    );
    return { kind: 'REVIVE' };
  }
  await refundOrEscalateDeadSquarePayment({ holdInvoice, paymentId: externalPaymentId, reason: 'items no longer available' });
  return { kind: 'DONE' };
}

export interface ExternalPaymentRef {
  /** Which processor recorded this payment -- discriminates which ID field this call writes,
   *  matching the `processor` string-discriminator convention already used on
   *  HoldInvoice/Purchase (schema.prisma, Square migration 2026-09-07 Wave 0). */
  processor: 'STRIPE' | 'SQUARE';
  // ADR-114 (2026-08-31): nullable to support the 'pos-cash' source above -- a fully-cash
  // invoice has no Stripe PaymentIntent (or Square Payment) at all. Every use of this value
  // below already tolerates null (stored as-is on HoldInvoice.stripePaymentIntentId/
  // squarePaymentId and Purchase.stripePaymentIntentId/squarePaymentId, all nullable columns;
  // only used in log/Sentry text otherwise) -- confirmed by reading the full function body
  // before this change.
  externalPaymentId: string | null;
}

/**
 * Square changeover Wave S1 (2026-09-09): generalized from a Stripe-only `paymentIntentId`
 * positional parameter to a `{ processor, externalPaymentId }` pair (see ExternalPaymentRef
 * above) so this recorder can be called for a Square-paid HoldInvoice once Wave S2 #3 wires
 * Square into reservationController.ts/posController.ts's invoice-creation paths. This is a
 * signature/branching change ONLY -- every existing STRIPE call site below is unchanged in
 * behavior (still writes HoldInvoice.stripePaymentIntentId/Purchase.stripePaymentIntentId
 * exactly as before); a SQUARE call just writes squarePaymentId instead. See
 * claude_docs/feature-notes/square-changeover-remaining-work-scoping-2026-09-09.md Section
 * 1.4 Wave S1.
 */
export async function markHoldInvoicePaid(
  invoiceId: string,
  paymentRef: ExternalPaymentRef,
  opts: MarkHoldInvoicePaidOpts,
  /** Internal: recursion guard for the flip-race revive. Callers never pass this. */
  _depth: number = 0
): Promise<MarkHoldInvoicePaidResult> {
  const { processor, externalPaymentId } = paymentRef;
  const { source, chargeId, stripeFeeAmountCents = 0 } = opts;

  // Fetch the invoice with full context
  const holdInvoice = await prisma.holdInvoice.findUnique({
    where: { id: invoiceId },
    include: {
      shopper: { select: { id: true, email: true, name: true, guildXp: true } },
      organizer: { select: { id: true, email: true, name: true } },
      sale: true,
    },
  });

  if (!holdInvoice) {
    console.error(`[hold-invoice/${source}] Invoice not found: ${invoiceId}`);
    return { recorded: false, alreadyPaid: false };
  }

  const fullySoldOutIds: string[] = [];
  const partialSaleUpdates: { itemId: string; remainingStock: number }[] = [];
  // Purchase-row backfill (2026-08-09): only items that actually sold in the loop below
  // get a Purchase row -- mirrors posPaymentLinkRecorder.ts's sellableItemIds/
  // oversoldItemIds split so a real oversold race never gets a fabricated PAID Purchase.
  const sellableItemIds: string[] = [];
  // 2026-09-29: ids of the Purchase rows THIS call created, for the post-commit engagement award.
  const recordedPurchaseIds: string[] = [];

  // Idempotency check (fast path, outside the tx): if already paid, skip.
  // NOTE this stays FIRST and returns before the dead-invoice guard below, so a legitimate
  // duplicate webhook delivery of the same charge.succeeded is still a silent no-op and
  // never raises a Sentry alert.
  if (holdInvoice.status === 'PAID') {
    console.warn(`[hold-invoice/${source}] Invoice ${invoiceId} already paid, skipping duplicate.`);
    return { recorded: false, alreadyPaid: true };
  }

  // P0 DEAD-INVOICE GUARD (2026-08-17) -- money could be captured with no recoverable record.
  // Before this branch, the ONLY state excluded from the flip below was 'PAID', so a
  // CANCELLED invoice (releaseInvoice, reservationController.ts:2205-2208) or an EXPIRED one
  // (invoiceExpiryJob.ts:279, stripeController.ts charge.failed :3311) satisfied
  // `status != 'PAID'` and was flipped FORWARD to PAID by a late charge.succeeded, with the
  // caller in stripeController.ts (:3176) performing no lifecycle check either.
  // Real failure mode: the organizer releases an invoice, its items return to inventory and
  // go back on sale, but the shopper's Stripe Checkout link is still payable -- they pay.
  // The dead invoice flips to PAID, items are marked SOLD and Purchase rows are written. If
  // an item was re-sold in the interim, sellItemUnits throws InsufficientStockError, that
  // item is excluded from Purchase creation (see the sellableItemIdSet filter below), and
  // Stripe has captured money with NO Purchase row at all -- refundService.ts's
  // executeVerifiedRefund keys off purchaseId, so there is nothing to refund against.
  //
  // PENDING is the ONLY legitimately payable state. Verified against every site that writes
  // HoldInvoice.status: all three creation paths write PENDING (posController.ts:664 and
  // :1379, reservationController.ts:1711); PAID is written only here and is handled above;
  // CANCELLED and EXPIRED are terminal (they are exactly holdInvoiceClaim.ts's
  // DEAD_INVOICE_STATUSES); REFUNDED (InvoiceStatus enum, schema.prisma:2753) can only ever
  // follow PAID and is never written to HoldInvoice anywhere in the backend today. The check
  // is written as `!== 'PENDING'` rather than an explicit dead-list so any future enum value
  // fails CLOSED (alert, record nothing) instead of silently becoming payable.
  //
  // NO automatic refund is issued -- see reportDeadInvoicePayment's note.
  // 2026-09-29: REFUNDED only ever follows PAID. A duplicate delivery of the payment that was later
  // refunded is a benign replay, not a dead-invoice payment: no alert, no work.
  if (holdInvoice.status === 'REFUNDED') {
    console.warn(`[hold-invoice/${source}] Invoice ${invoiceId} already refunded, skipping duplicate.`);
    return { recorded: false, alreadyPaid: true };
  }

  // Set when a completed Square payment revives a CANCELLED/EXPIRED invoice (see the
  // DEAD-INVOICE RESOLUTION note in the header). The flip below is then guarded on THAT status.
  let reviveFromStatus: string | null = null;

  if (holdInvoice.status !== 'PENDING') {
    const resolution = await resolveDeadInvoicePayment({
      holdInvoice,
      processor,
      externalPaymentId,
      source,
      chargeId,
      detectedAt: 'pre-transaction',
    });
    if (resolution.kind === 'DONE') {
      return { recorded: false, alreadyPaid: false, deadInvoice: true };
    }
    reviveFromStatus = holdInvoice.status;
  }

  // Fetch all items and reservations bundled in this invoice
  // Money review P1-4/5 (2026-09-29): every lookup below is pinned to THIS invoice's sale and
  // organizer, so an itemId that somehow landed on the invoice from another tenant can never be
  // sold, get a Purchase row, or have its reservation completed by this payment.
  const itemScope = { saleId: holdInvoice.saleId, sale: { organizerId: holdInvoice.sale?.organizerId ?? undefined } };
  const bundledItems = await prisma.item.findMany({
    where: { id: { in: holdInvoice.itemIds }, ...itemScope },
  });
  const bundledItemIdSet = new Set(bundledItems.map((it: { id: string }) => it.id));
  const scopedItemIds: string[] = holdInvoice.itemIds.filter((id: string) => bundledItemIdSet.has(id));
  if (scopedItemIds.length !== holdInvoice.itemIds.length) {
    const foreign = holdInvoice.itemIds.filter((id: string) => !bundledItemIdSet.has(id));
    console.error(`[hold-invoice/${source}] Invoice ${invoiceId} lists item id(s) outside its sale/organizer scope, EXCLUDED from the sale: ${foreign.join(',')}`);
    try {
      Sentry.captureMessage('[hold-invoice] invoice lists items outside its sale scope', {
        level: 'error',
        tags: { area: 'hold-invoice-item-scope', source },
        extra: { invoiceId, saleId: holdInvoice.saleId, foreignItemIds: foreign },
      });
    } catch {
      // Sentry may not be initialized.
    }
  }

  const bundledReservations = await prisma.itemReservation.findMany({
    where: { itemId: { in: scopedItemIds }, item: { saleId: holdInvoice.saleId } },
  });
  void bundledReservations; // preserved verbatim from the original charge.succeeded handler (unused there too)

  // LOCKED DECISION #1: Calculate organizer payout (total amount - platform fee - Stripe fee)
  const stripeFeeAmount = stripeFeeAmountCents / 100; // convert from cents
  const organizerPayout = (holdInvoice.totalAmount / 100) - (holdInvoice.platformFeeAmount / 100) - stripeFeeAmount;

  // ADR-136 Addendum B (2026-10-05, #659): which bundled items are bulk lots. Looked up HERE, outside the transaction (a failed
  // query inside a Postgres transaction poisons it). Flag off: a failed lookup means "no lots" (fail open); flag on: it throws,
  // the caller retries, and a lot is never recorded as a single unit because a lookup hiccuped.
  const lotItemIdSet = await findBulkLotItemIds(prisma as any, scopedItemIds, isBulkLotsEnabled());
  // Per lot item: the BulkLotHold that carries this invoice (cards, price snapshot, status). Filled inside the transaction.
  const lotHoldByItem = new Map<string, { id: string; quantity: number; lineCents: number; status: string }>();

  let didRecord = false;
  // 2026-09-30 oversold settlement: computed inside the tx (needs the row amounts), acted on after it
  // commits (the refund is an external call). Held in an object so TS does not narrow it to null.
  const oversoldCtx: { settlement: OversoldSettlement | null; titles: string[] } = { settlement: null, titles: [] };
  // P0 (2026-08-17): when the guarded flip below matches zero rows, that no longer means
  // only "a concurrent call already recorded it" -- it can also mean the invoice went
  // CANCELLED/EXPIRED between the read above and the flip. The two outcomes need opposite
  // handling (silent no-op vs. loud alert), so the actual post-flip status is captured here.
  let postFlipStatus: string | null = null;

  // Update invoice status to PAID
  try {
  await prisma.$transaction(async (tx) => {
    // Guarded conditional update (not read-then-write): WHERE id = X AND status != 'PAID'
    // is a single UPDATE statement, so Postgres's row lock on the matched row is what
    // actually serializes a concurrent webhook/reconcile race -- the loser's WHERE clause
    // re-evaluates against the winner's committed row once unblocked and matches zero
    // rows. A separate findUnique-then-update pair does NOT get this guarantee under
    // READ COMMITTED (Postgres default, no isolationLevel override here): a plain SELECT
    // takes no lock, so two concurrent transactions can both read status !== 'PAID'
    // before either commits, and an unconditional `update({ where: { id } })` then lets
    // BOTH proceed to double-decrement stock / double-send notifications and emails.
    // Mirrors the guarded-updateMany pattern already used by itemStockService.sellItemUnits
    // and invoiceExpiryJob's own PENDING -> EXPIRED flip.
    //
    // P0 (2026-08-17): the WHERE is `status: 'PENDING'`, not the old `status: { not: 'PAID' }`.
    // The old form let a CANCELLED or EXPIRED invoice flip FORWARD to PAID on a late
    // charge.succeeded -- see the DEAD-INVOICE GUARD above for the full failure mode. This
    // is also the race-safe half of that guard: the pre-transaction check can be stale, but
    // this single conditional UPDATE takes the row lock, so an invoice released a
    // millisecond ago still matches zero rows here.
    const flip = await tx.holdInvoice.updateMany({
      where: { id: invoiceId, status: (reviveFromStatus ?? 'PENDING') as any },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        ...(reviveFromStatus ? { releasedAt: null } : {}),
        processor,
        // Square changeover Wave S1 (2026-09-09): processor-branched write -- a STRIPE call
        // writes stripePaymentIntentId exactly as before (zero behavior change); a SQUARE call
        // writes squarePaymentId instead. Never writes both.
        ...(processor === 'SQUARE'
          ? { squarePaymentId: externalPaymentId }
          : { stripePaymentIntentId: externalPaymentId }),
        stripeFeeAmount: Math.round(stripeFeeAmount * 100),
      },
    });
    if (flip.count === 0) {
      // Re-read to find out WHY it matched nothing: 'PAID' = benign concurrent recorder
      // (silent no-op, as before); anything else = the invoice died under us and a real
      // payment just landed on it (alert, record nothing). Safe to read here -- the flip's
      // failed WHERE already waited on any competing write's row lock, so this sees the
      // committed winner's value.
      const current = await tx.holdInvoice.findUnique({
        where: { id: invoiceId },
        select: { status: true },
      });
      postFlipStatus = current?.status ?? null;
      return;
    }
    didRecord = true;

    // Update ALL bundled ItemReservations to COMPLETED (terminal, paid -- see
    // ADR-multi-stock-partial-sale-status-revert-2026-08-25.md addendum, 2026-08-26).
    // 'CONFIRMED' is deliberately NOT used here: 3 other writers (stripeController.ts
    // invoice-release revert, invoiceExpiryJob.ts stranded-invoice revert,
    // posStrandedSaleReconcileCron.ts stranded-sale revert) correctly use 'CONFIRMED' to
    // mean "reverted to an active, not-yet-paid hold" -- placeHold's stale-cleanup
    // deleteMany (reservationController.ts) does NOT clear 'CONFIRMED' rows for exactly
    // that reason, which is what let a genuinely paid reservation permanently occupy the
    // one-hold-per-item @unique slot and block every future hold on the same item.
    // 'COMPLETED' is the pre-existing terminal value (reservationController.ts markSold,
    // ~line 1133) that IS cleared by that same deleteMany.
    await tx.itemReservation.updateMany({
      where: { itemId: { in: scopedItemIds }, item: { saleId: holdInvoice.saleId } },
      data: { status: 'COMPLETED' },
    });

    // ADR-136 Addendum B (#659): the holds that carry this invoice's lot lines. The cards were taken from the lot when the
    // hold was placed, so a lot line settles against its hold (below), never against sellItemUnits(item, 1).
    if (lotItemIdSet.size > 0) {
      const lotHolds: Array<{ id: string; itemId: string; quantity: number; lineCents: number; status: string }> = await tx.bulkLotHold.findMany({
        where: { holdInvoiceId: invoiceId, itemId: { in: Array.from(lotItemIdSet) } },
        select: { id: true, itemId: true, quantity: true, lineCents: true, status: true },
      });
      for (const h of lotHolds) lotHoldByItem.set(h.itemId, { id: h.id, quantity: h.quantity, lineCents: h.lineCents, status: h.status });
    }

    // Update ALL bundled items to SOLD (LOCKED DECISION #6) -- ADR-085 Track B
    // Phase 1 Step 4: atomic, race-safe stock decrement replaces the old unconditional
    // updateMany. The bundling business decision (#6) is unchanged, only the mechanism.
    for (const bundledItemId of scopedItemIds) {
      try {
        let fullySoldOut: boolean;
        let remainingStock: number;
        if (lotItemIdSet.has(bundledItemId)) {
          // ADR-136 Addendum B (#659): settle a lot line against its hold. A lot with no hold on this invoice is refused like an
          // oversold item (nothing is sold, the card share is refunded below) rather than ever being sold as one unit.
          const lotHold = lotHoldByItem.get(bundledItemId);
          if (!lotHold) throw new InsufficientStockError(bundledItemId, 0, 0);
          let converted = false;
          if (lotHold.status === 'ACTIVE') {
            const flip = await tx.bulkLotHold.updateMany({ where: { id: lotHold.id, status: 'ACTIVE' }, data: { status: 'CONVERTED' } });
            converted = flip.count === 1;
          }
          if (converted) {
            // The cards are already out of the lot; only read what is left.
            const row = await tx.item.findUnique({ where: { id: bundledItemId }, select: { stockTotal: true, stockSold: true } });
            const left = Math.max(0, (Number(row?.stockTotal ?? 1)) - (Number(row?.stockSold ?? 0)));
            fullySoldOut = left <= 0;
            remainingStock = left;
          } else {
            // The hold expired or was released before the payment landed, so its cards went back to the lot: take them again.
            // InsufficientStockError here is the oversold path below (the cards were sold to someone else in between).
            const again = await sellItemUnits(bundledItemId, lotHold.quantity, tx);
            await tx.bulkLotHold.updateMany({ where: { id: lotHold.id, status: { in: ['EXPIRED', 'RELEASED'] } }, data: { status: 'CONVERTED' } });
            fullySoldOut = again.fullySoldOut;
            remainingStock = again.remainingStock;
          }
        } else {
          const sold = await sellItemUnits(bundledItemId, 1, tx);
          fullySoldOut = sold.fullySoldOut;
          remainingStock = sold.remainingStock;
        }
        if (fullySoldOut) fullySoldOutIds.push(bundledItemId);
        else partialSaleUpdates.push({ itemId: bundledItemId, remainingStock });
        sellableItemIds.push(bundledItemId);
      } catch (stockErr: any) {
        if (stockErr instanceof InsufficientStockError && reviveFromStatus) {
          // Reviving a dead invoice: never leave a half-recorded sale. Roll the whole revive back;
          // the caller refunds the payment instead.
          throw new DeadInvoiceReviveAbort(bundledItemId);
        }
        if (stockErr instanceof InsufficientStockError) {
          // P0 (2026-08-17): this was console.error ONLY -- one line in Railway, no alert.
          // The consequence is money-shaped: this item is excluded from Purchase creation
          // below (sellableItemIdSet), so Stripe has captured payment for an item with no
          // Purchase row, and refundService.ts's executeVerifiedRefund keys off purchaseId
          // -- there is nothing to refund against without manual intervention. That must
          // page, not whisper.
          //
          // Deliberately NOT converted to a throw. The whole webhook switch in
          // stripeController.ts is wrapped in a try/catch (:1094-1097) that marks the
          // idempotency row FAILED and returns 500, which makes Stripe retry with backoff.
          // A throw here would roll back this ENTIRE transaction -- including the PAID flip
          // and the Purchase rows for every OTHER item in the bundle that sold fine -- and
          // every retry would deterministically hit the same oversold item and roll back
          // again, so the invoice would never record at all and Stripe would retry for days.
          // Swallowing preserves the partial record (which is the recoverable state) and the
          // Sentry alert is what makes the shortfall actionable.
          const oversoldMsg =
            `[hold-invoice/${source}] OVERSOLD-RACE invoice=${invoiceId} item=${bundledItemId} ` +
            `pi=${externalPaymentId} -- payment captured but this item could not be sold ` +
            `(${stockErr.message}). No Purchase row will be created for it. The card share of ` +
            `this item is refunded automatically after the transaction commits (Square; kill ` +
            `switch SQUARE_DEAD_INVOICE_AUTO_REFUND_DISABLED); if that refund is not issued the ` +
            `organizer is told to refund it by hand.`;
          console.error(oversoldMsg);
          try {
            Sentry.captureException(stockErr, {
              tags: { area: 'hold-invoice-oversold-race', source },
              extra: {
                message: oversoldMsg,
                invoiceId,
                itemId: bundledItemId,
                processor,
                externalPaymentId,
                chargeId: chargeId ?? null,
                saleId: holdInvoice.saleId,
                shopperUserId: holdInvoice.shopperUserId,
                invoiceTotalAmountCents: holdInvoice.totalAmount,
              },
            });
          } catch {
            // Sentry may not be initialized -- never let the alert path throw, that would
            // defeat the whole point of not rethrowing above.
          }
        } else {
          throw stockErr;
        }
      }
    }

    // Purchase-row backfill (2026-08-09): create one Purchase row per bundled item that
    // actually sold above, so refundService.ts's executeVerifiedRefund and
    // stripeController.ts's resolveDisputeContext have a record to find for this
    // Hold-to-Pay sale. Every field below is sourced from data already fetched/verified
    // in this function (holdInvoice, bundledItems, the paymentIntentId parameter) -- no
    // re-derivation through a different path that could drift from what actually
    // happened. HoldInvoice.chargeType/stripeAccountId (2026-08-18 migration, see header
    // comment) are preferred when set; only a pre-migration NULL row recomputes
    // DIRECT-vs-DESTINATION via the sale's organizer, mirroring posPaymentLinkRecorder.ts's
    // still-live gap for POSPaymentLink.
    const sellableItemIdSet = new Set(sellableItemIds);
    const invoicePlatformFeeDollars = holdInvoice.platformFeeAmount / 100;

    // Exact-cent allocation across ALL bundled items (2026-09-29; see the DISCOUNTED / SPLIT-TENDER
    // block in the file header). Only sellable items get a row below, so an oversold item's share
    // is dropped rather than pushed onto the rows that did sell.
    // ADR-136 Addendum B (#659): a lot line is worth what its hold priced it at (cards x price per 1,000 at the time of the hold),
    // not the item price (which is dollars per 1,000).
    const itemPriceCentsList = bundledItems.map((it) => lotHoldByItem.get(it.id)?.lineCents ?? Math.round((it.price || 0) * 100));
    const itemPriceCentsSum = itemPriceCentsList.reduce((a, b) => a + b, 0);
    const invoiceIsDiscounted =
      holdInvoice.itemIds.length > 0 &&
      itemPriceCentsSum > 0 &&
      holdInvoice.totalAmount > 0 &&
      holdInvoice.totalAmount < itemPriceCentsSum;
    // Discounted: scale each row so the rows add up to what was paid. Otherwise: list price, as before.
    const rowAmountCentsList = invoiceIsDiscounted
      ? allocateCentsProportionally(holdInvoice.totalAmount, itemPriceCentsList)
      : itemPriceCentsList;
    const rowFeeCentsList = allocateCentsProportionally(holdInvoice.platformFeeAmount, itemPriceCentsList);
    const invoiceCashCents = holdInvoice.cashAmountCents && holdInvoice.cashAmountCents > 0 ? holdInvoice.cashAmountCents : 0;
    // Cash-leg allocation (money review P2, 2026-09-29). The Purchase rows only cover the bundled
    // items; the invoice total can also carry lines that have no row (shipping, misc lines, which
    // are not persisted). Allocating the WHOLE cash leg over the rows and then capping each row
    // silently dropped the excess, so a refund believed the card had collected more than it did.
    // The rows now carry their share of the cash leg: cash * (rows total / invoice total), in exact
    // cents. When the rows ARE the whole invoice (the discounted case) that is the full cash leg.
    const rowsTotalCents = rowAmountCentsList.reduce((a, b) => a + b, 0);
    const cashOnRowsCents =
      invoiceCashCents > 0 && rowsTotalCents > 0
        ? holdInvoice.totalAmount > 0
          ? Math.min(invoiceCashCents, Math.round((invoiceCashCents * Math.min(rowsTotalCents, holdInvoice.totalAmount)) / holdInvoice.totalAmount))
          : Math.min(invoiceCashCents, rowsTotalCents)
        : 0;
    const rowCashCentsList = allocateCentsProportionally(cashOnRowsCents, rowAmountCentsList);

    // 2026-09-30 (payment review finding 2): every paid row that could not be sold is refunded, not just
    // alerted. The card leg is allocated across ALL rows (exact cents, largest remainder) and the oversold
    // rows' share goes back; when every row is oversold the whole card leg goes back. A sale with no
    // processor payment (fully cash at the register, or no payment id) has no card leg: only cash is owed.
    const oversoldRowIdx = bundledItems.map((it, idx) => (sellableItemIdSet.has(it.id) ? -1 : idx)).filter((idx) => idx >= 0);
    if (oversoldRowIdx.length > 0 && !reviveFromStatus) {
      const noCardLeg = source === 'pos-cash' || !externalPaymentId;
      oversoldCtx.settlement = computeOversoldSettlement({
        cardCents: noCardLeg ? 0 : invoiceCardLegCents(holdInvoice),
        cashCents: noCardLeg ? holdInvoice.totalAmount : invoiceCashCents,
        weightsCents: rowAmountCentsList,
        oversoldIdx: oversoldRowIdx,
      });
      oversoldCtx.titles = oversoldRowIdx.map((idx) => bundledItems[idx].title);
    }

    // Stripe account + charge-shape snapshot (2026-08-18 migration): prefer the value
    // pinned on the invoice itself at checkout-session-creation time. Only a pre-migration
    // row (chargeType NULL) falls back to recomputing it live against the sale's organizer.
    const saleOrganizerId = holdInvoice.sale?.organizerId ?? null;
    let useDirect: boolean;
    let chargeAccountId: string | null;
    if (holdInvoice.chargeType) {
      useDirect = holdInvoice.chargeType === 'DIRECT';
      chargeAccountId = holdInvoice.stripeAccountId ?? null;
    } else {
      const saleOrganizer = saleOrganizerId
        ? await tx.organizer.findUnique({ where: { id: saleOrganizerId }, select: { stripeConnectId: true } })
        : null;
      useDirect = !!(saleOrganizerId && saleOrganizer?.stripeConnectId
        ? await shouldUseDirectCharge(saleOrganizerId, saleOrganizer.stripeConnectId)
        : false);
      chargeAccountId = useDirect ? saleOrganizer?.stripeConnectId ?? null : null;
    }

    // Shipping passthrough (2026-09-16 follow-up, guest-invoice shipping/phone): a
    // guest-invoice organizer may have captured a real ship-to address on the invoice
    // itself (HoldInvoice.shippingAddressLine1/2/City/State/Zip/Country -- same field
    // names/shape as Purchase's own SHIPPING DESTINATION block, deliberately). Copy it
    // straight onto the Purchase row(s) below so the EXISTING "buy shipping label" feature
    // (payoutController.ts's buyShippingLabel) works on an invoice-born order with no
    // further changes there. deliveryMethod only flips to 'SHIP' when the address is
    // actually complete (line1+city+state+zip) -- mirrors squarePaymentController.ts's own
    // shippingApplicable gate; a partial/blank address must not silently claim SHIP and
    // then 400 at label-purchase time with no visible reason.
    const hasShippingAddress = !!(
      holdInvoice.shippingAddressLine1 && holdInvoice.shippingCity &&
      holdInvoice.shippingState && holdInvoice.shippingZip
    );
    // Explicit Purchase.processor (never the schema default 'STRIPE'): a fully-cash-at-register invoice
    // ('pos-cash' source / no external payment id) never touched a card processor, so its rows are 'CASH'.
    const purchaseProcessor: string =
      processor !== 'SQUARE' && (source === 'pos-cash' || !externalPaymentId) ? 'CASH' : processor;
    const shippingFieldsForPurchase = hasShippingAddress
      ? {
          deliveryMethod: 'SHIP',
          shippingAddressLine1: holdInvoice.shippingAddressLine1,
          shippingAddressLine2: holdInvoice.shippingAddressLine2 ?? undefined,
          shippingCity: holdInvoice.shippingCity,
          shippingState: holdInvoice.shippingState,
          shippingZip: holdInvoice.shippingZip,
          shippingCountry: holdInvoice.shippingCountry ?? undefined,
        }
      : {};

    for (let bundledIdx = 0; bundledIdx < bundledItems.length; bundledIdx++) {
      const bundledItem = bundledItems[bundledIdx];
      if (!sellableItemIdSet.has(bundledItem.id)) continue; // oversold race -- no Purchase row, matches posPaymentLinkRecorder.ts
      // Discounted invoice: the scaled share of what was paid; otherwise the list price untouched.
      const lotHoldForRow = lotHoldByItem.get(bundledItem.id);
      const itemAmount = invoiceIsDiscounted ? rowAmountCentsList[bundledIdx] / 100 : lotHoldForRow ? lotHoldForRow.lineCents / 100 : (bundledItem.price || 0);
      const itemPlatformFeeAmount = rowFeeCentsList[bundledIdx] / 100;
      // Never let a row's cash leg exceed the row itself.
      const rowCashCents = Math.min(rowCashCentsList[bundledIdx] ?? 0, rowAmountCentsList[bundledIdx] ?? 0);
      try {
        const createdPurchase = await tx.purchase.create({
          data: {
            userId: holdInvoice.shopperUserId,
            // Guest invoice (2026-09-16, nullable shopperUserId): no real User row to read
            // contact info from at refund/support time, so stamp it directly on the Purchase
            // row -- same Purchase.buyerEmail/guestName columns squarePaymentController.ts's
            // guest checkout already uses for exactly this reason. Omitted (not overwritten
            // with undefined) for a real-account invoice; that Purchase already has a User
            // to look up via userId.
            ...(!holdInvoice.shopperUserId ? { buyerEmail: holdInvoice.guestEmail ?? undefined, guestName: holdInvoice.guestName ?? undefined } : {}),
            ...shippingFieldsForPurchase,
            itemId: bundledItem.id,
            saleId: holdInvoice.saleId,
            ...(lotHoldForRow ? { bulkQuantity: lotHoldForRow.quantity } : {}), // ADR-136 Addendum B: cards on this sale row (refunds read it)
            amount: itemAmount,
            platformFeeAmount: itemPlatformFeeAmount,
            ...(rowCashCents > 0 ? { cashLegAmount: rowCashCents / 100 } : {}),
            // FEE SNAPSHOT (2026-08-17): commission-only — a hold invoice is never an auction
            // lot. commissionRate is null by design: the invoice's fee is prorated across its
            // bundled items by price share, so a per-row rate would be a back-derived guess
            // rather than a rate anything was actually charged at. The AMOUNT is what earnings
            // reporting needs, and it is exact.
            buyerPremiumAmount: 0,
            buyerPremiumRate: 0,
            commissionAmount: itemPlatformFeeAmount,
            commissionRate: null,
            organizerAbsorbedPremium: false,
            status: 'PAID',
            // ADR-114 (2026-08-31): this Purchase row previously hardcoded 'ONLINE' for
            // every caller of this function -- correct for the Stripe webhook/reconcile/
            // webhook-fallback sources (a real online card payment), but wrong for the new
            // 'pos-cash' source (an in-person cash sale, matching Purchase.source's other
            // established value 'POS' -- see terminalController.ts's own cash/card Purchase
            // rows, which already use 'POS').
            source: source === 'pos-cash' ? 'POS' : 'ONLINE',
            processor: purchaseProcessor,
            ...(processor === 'SQUARE'
              ? { squarePaymentId: externalPaymentId }
              : { stripePaymentIntentId: externalPaymentId }),
            chargeType: useDirect ? 'DIRECT' : 'DESTINATION',
            ...(useDirect && chargeAccountId ? { stripeAccountId: chargeAccountId } : {}),
          },
        });
        recordedPurchaseIds.push(createdPurchase.id);
        if (lotHoldForRow) await tx.bulkLotHold.updateMany({ where: { id: lotHoldForRow.id }, data: { purchaseId: createdPurchase.id } });
      } catch (purchaseErr: any) {
        // Compound partial unique (stripePaymentIntentId, itemId) backstop -- mirrors
        // posPaymentLinkRecorder.ts: a concurrent webhook/reconcile race that both reach
        // this insert can't double-create a Purchase row for the same item + PaymentIntent.
        // KNOWN GAP (Square changeover Wave S1, 2026-09-09, not fixed here): this backstop
        // only covers stripePaymentIntentId -- a SQUARE-processor row has no matching unique
        // index on squarePaymentId yet. Flagged for a follow-up schema change once Wave S2
        // wires real Square traffic through this recorder; out of scope for this dispatch
        // (no schema.prisma edits permitted).
        if (purchaseErr.code === 'P2002') {
          console.warn(`[hold-invoice/${source}] Purchase already exists for item ${bundledItem.id} on invoice ${invoiceId} — treating as already recorded.`);
        } else {
          throw purchaseErr;
        }
      }
    }

    // Purchase-row backfill (2026-08-09) miscItems/cash-only edge case: createCombinedInvoice
    // (posController.ts) allows an invoice made entirely of request-body `miscItems` with NO
    // bundled Item rows at all (POS combined cart, e.g. a custom/non-inventory line item) --
    // holdInvoice.itemIds is legitimately [] here, not an oversold race (oversold items are
    // already handled by the sellableItemIdSet filter above, which only runs for invoices that
    // DID have bundled items). miscItems content itself is never persisted on HoldInvoice, so
    // it cannot be reconstructed as individual Purchase rows here -- but leaving this class of
    // invoice with ZERO Purchase rows would leave it exactly as unrefundable/undisputable as
    // the bug this fix closes for item-bundled invoices. One aggregate Purchase row
    // (itemId: null -- Purchase.itemId is nullable for exactly this kind of non-inventory sale,
    // same as the existing ALA_CARTE source rows in stripeController.ts) for the invoice's full
    // totalAmount/platformFeeAmount covers it.
    if (holdInvoice.itemIds.length === 0) {
      try {
        const aggregatePurchase = await tx.purchase.create({
          data: {
            userId: holdInvoice.shopperUserId,
            // Guest invoice: see the identical comment on the bundled-item Purchase.create above.
            ...(!holdInvoice.shopperUserId ? { buyerEmail: holdInvoice.guestEmail ?? undefined, guestName: holdInvoice.guestName ?? undefined } : {}),
            ...shippingFieldsForPurchase,
            itemId: null,
            saleId: holdInvoice.saleId,
            amount: holdInvoice.totalAmount / 100,
            platformFeeAmount: invoicePlatformFeeDollars,
            ...(invoiceCashCents > 0 ? { cashLegAmount: Math.min(invoiceCashCents, holdInvoice.totalAmount) / 100 } : {}),
            // FEE SNAPSHOT (2026-08-17): commission-only. This is the whole-invoice aggregate
            // row, so the fee is the invoice's own figure with no proration — but still no
            // single rate behind it (miscItems are priced ad hoc), hence null.
            buyerPremiumAmount: 0,
            buyerPremiumRate: 0,
            commissionAmount: invoicePlatformFeeDollars,
            commissionRate: null,
            organizerAbsorbedPremium: false,
            status: 'PAID',
            // ADR-114 (2026-08-31): this Purchase row previously hardcoded 'ONLINE' for
            // every caller of this function -- correct for the Stripe webhook/reconcile/
            // webhook-fallback sources (a real online card payment), but wrong for the new
            // 'pos-cash' source (an in-person cash sale, matching Purchase.source's other
            // established value 'POS' -- see terminalController.ts's own cash/card Purchase
            // rows, which already use 'POS').
            source: source === 'pos-cash' ? 'POS' : 'ONLINE',
            processor: purchaseProcessor,
            ...(processor === 'SQUARE'
              ? { squarePaymentId: externalPaymentId }
              : { stripePaymentIntentId: externalPaymentId }),
            chargeType: useDirect ? 'DIRECT' : 'DESTINATION',
            ...(useDirect && chargeAccountId ? { stripeAccountId: chargeAccountId } : {}),
          },
        });
        recordedPurchaseIds.push(aggregatePurchase.id);
      } catch (purchaseErr: any) {
        if (purchaseErr.code === 'P2002') {
          console.warn(`[hold-invoice/${source}] Purchase already exists for invoice ${invoiceId} (no bundled items) — treating as already recorded.`);
        } else {
          throw purchaseErr;
        }
      }
    }

    // ADR-114 (2026-08-31) Security-QA fix (fix-and-reverify, applicable-feature adversarial
    // pass on the ADR-114 payment-path changes): any HoldInvoice with a cash leg -- a fully-cash
    // 'pos-cash' sale OR a partial cash+card split, both created by posController.ts's
    // sendHoldInvoice -- previously accrued ZERO commission on the cash portion.
    // HoldInvoice.platformFeeAmount is computed on the CARD portion only (by design, mirroring
    // createCombinedInvoice's documented asymmetry), and nothing backstopped the cash leg the
    // way cashFeeService.ts already does for terminalController.ts's and
    // posPaymentController.ts's split-tender flows. Before this fix, any organizer/team-member
    // could set cashAmountCents >= grandTotal on a hold invoice to get a real sale recorded (a
    // real Purchase row, items marked SOLD) while paying literally zero commission, permanently
    // -- a live, newly-exploitable fee-avoidance hole (createCombinedInvoice had the same
    // asymmetry but its fully-cash branch could never actually complete a sale, so it was never
    // reachable there; sendHoldInvoice's new fully-cash branch is what makes it reachable).
    // Resolved through the SAME shared, tier-aware resolver every other cash-commission call
    // site uses, at settlement time (here, inside the same $transaction as the PAID flip and
    // Purchase-row creation -- NOT at invoice-creation time) so a rolled-back settlement can
    // never leave an accrued debt behind for a sale that was not actually recorded, matching
    // cashFeeService.ts's own documented guidance for transactional callers.
    //
    // 2026-09-29: now goes through accrueSplitCashLegOnce (CashFeeAccrual ledger, unique per
    // ('HOLD_INVOICE', invoice id)) instead of the plain accrueCashFeeBalance, which was NOT
    // idempotent (a replay of this recorder would have accrued twice). The commission is on the
    // CASH amount at the organizer's tier/referral cash rate; the card leg's platform fee is the
    // invoice's own platformFeeAmount (card amount basis) and is already on the Purchase rows.
    // A failure throws and rolls back the whole recording (see the file header): the caller's
    // retry re-attempts it, and an invoice is never left PAID with an unaccrued cash commission.
    if (invoiceCashCents > 0 && saleOrganizerId) {
      // holdInvoice.organizer is the organizer's USER row (organizerUserId relation) -- it has no
      // subscriptionTier/referralDiscountExpiry (those live on Organizer). Fetch the real
      // Organizer profile via saleOrganizerId (holdInvoice.sale.organizerId).
      const cashFeeOrganizer = await tx.organizer.findUnique({
        where: { id: saleOrganizerId },
        select: { id: true, subscriptionTier: true, referralDiscountExpiry: true },
      });
      if (cashFeeOrganizer) {
        await accrueSplitCashLegOnce({
          organizer: {
            id: cashFeeOrganizer.id,
            subscriptionTier: cashFeeOrganizer.subscriptionTier,
            referralDiscountExpiry: cashFeeOrganizer.referralDiscountExpiry ?? null,
          },
          sourceType: 'HOLD_INVOICE',
          sourceId: invoiceId,
          cashAmountCents: invoiceCashCents,
          tx,
        });
      } else {
        console.error(`[hold-invoice/${source}] Cash-leg commission NOT accrued for invoice ${invoiceId}: organizer ${saleOrganizerId} not found.`);
        try {
          Sentry.captureMessage(`[hold-invoice/${source}] cash-leg commission not accrued: organizer missing`, {
            level: 'error',
            tags: { area: 'hold-invoice-cash-commission-accrual', source },
            extra: { invoiceId, organizerId: saleOrganizerId, cashAmountCents: invoiceCashCents },
          });
        } catch {
          // Sentry may not be initialized -- silently continue
        }
      }
    }

    // LOCKED DECISION #5: Create notifications for shopper and organizer
    // 2026-09-30: when items were oversold, only the items that actually sold are named, and when NOTHING
    // sold there is no "Payment confirmed / Payment received" message at all (the settlement notice below
    // is the accurate one).
    const keptItemsNotif = oversoldCtx.settlement ? bundledItems.filter((it) => sellableItemIdSet.has(it.id)) : bundledItems;
    const itemListNotif = keptItemsNotif.length > 1
      ? `${keptItemsNotif.length} items`
      : `"${keptItemsNotif[0]?.title}"`;
    const nothingFulfilledNotif = !!oversoldCtx.settlement && keptItemsNotif.length === 0;

    // Guest invoice (2026-09-16): Notification.userId is required and a guest has no
    // account/inbox to see an in-app notification in anyway -- only queue the shopper
    // notification when shopperUserId is a real account. The organizer notification below is
    // unconditional either way -- unaffected by who the buyer is.
    if (!nothingFulfilledNotif) await tx.notification.createMany({
      data: [
        ...(holdInvoice.shopperUserId
          ? [{
              userId: holdInvoice.shopperUserId,
              type: 'payment_completed',
              title: 'Payment confirmed',
              body: `Payment confirmed for ${itemListNotif}. The organizer will send shipping/pickup details.`,
              link: `/items/${holdInvoice.itemIds[0]}`,
              channel: 'OPERATIONAL',
            }]
          : []),
        {
          userId: holdInvoice.organizerUserId,
          type: 'payment_received',
          title: 'Payment received',
          body: `Payment of $${organizerPayout.toFixed(2)} received for ${itemListNotif}. Payout pending.`,
          link: `/organizer/sales/${holdInvoice.saleId}`,
          channel: 'OPERATIONAL',
        },
      ],
    });
  });
  } catch (txErr) {
    if (txErr instanceof DeadInvoiceReviveAbort && externalPaymentId) {
      // An item was sold under the revive: the whole revive rolled back. Refund what was captured.
      await refundOrEscalateDeadSquarePayment({
        holdInvoice,
        paymentId: externalPaymentId,
        reason: `revive aborted, item ${txErr.itemId} no longer sellable`,
      });
      return { recorded: false, alreadyPaid: false, deadInvoice: true };
    }
    throw txErr;
  }

  if (!didRecord) {
    // P0 (2026-08-17): a zero-count flip is only benign if the invoice is now PAID. If it
    // went CANCELLED/EXPIRED between the read and the flip, a real payment just landed on a
    // dead invoice and nothing was recorded -- same alert as the pre-transaction guard.
    if (postFlipStatus && postFlipStatus !== 'PAID') {
      if (postFlipStatus === 'REFUNDED') {
        return { recorded: false, alreadyPaid: true };
      }
      const resolution = await resolveDeadInvoicePayment({
        holdInvoice: { ...holdInvoice, status: postFlipStatus },
        processor,
        externalPaymentId,
        source,
        chargeId,
        detectedAt: 'flip-race',
      });
      if (resolution.kind === 'REVIVE' && _depth < 1) {
        // The invoice died between the read and the flip and the payment is revivable: run the
        // whole recording again, this time from the now-visible dead status.
        return markHoldInvoicePaid(invoiceId, paymentRef, opts, _depth + 1);
      }
      return { recorded: false, alreadyPaid: false, deadInvoice: true };
    }
    // Another path (concurrent webhook/reconcile) already recorded this payment.
    console.warn(`[hold-invoice/${source}] Invoice ${invoiceId} was recorded by a concurrent call, skipping duplicate.`);
    return { recorded: false, alreadyPaid: true };
  }

  if (reviveFromStatus) {
    try {
      Sentry.captureMessage('[hold-invoice] late Square payment recorded on a dead invoice', {
        level: 'warning',
        tags: { area: 'hold-invoice-dead-payment', resolution: 'revived' },
        extra: { invoiceId, paymentId: externalPaymentId, previousStatus: reviveFromStatus, amountCents: holdInvoice.totalAmount },
      });
    } catch {
      // Sentry may not be initialized.
    }
    await notifyDeadInvoicePayment({ holdInvoice, outcome: 'RECORDED', amountCents: holdInvoice.totalAmount });
  }

  // 2026-09-30 (payment review finding 2): settle the captured money for any oversold item. Awaited so the
  // outcome is in the result and a crash cannot silently skip it; the helpers never throw, so a refund or
  // notification problem can never fail an invoice that already recorded.
  let oversoldOutcome: MarkHoldInvoicePaidResult['oversoldSettlement'];
  if (oversoldCtx.settlement) {
    const settlement = oversoldCtx.settlement;
    const settled = await settleOversoldPayment({
      kind: 'hold-invoice',
      refId: invoiceId,
      organizerProfileId: holdInvoice.sale?.organizerId ?? null,
      processor,
      paymentId: externalPaymentId,
      cardPaidCents: invoiceCardLegCents(holdInvoice),
      settlement,
    });
    oversoldOutcome = {
      status: settled.status,
      refundCents: settled.refundCents,
      fullRefund: settlement.fullRefund,
      cashToReturnCents: settlement.cashToReturnCents,
    };
    await notifyOversoldSettlement({
      result: settled,
      settlement,
      titles: oversoldCtx.titles,
      processor,
      ref: invoiceId,
      partiallyFulfilled: sellableItemIds.length > 0,
      organizerUserId: holdInvoice.organizerUserId,
      organizerLink: `/organizer/sales/${holdInvoice.saleId}`,
      shopper: {
        userId: holdInvoice.shopperUserId,
        email: holdInvoice.shopper?.email ?? holdInvoice.guestEmail ?? null,
        name: holdInvoice.shopper?.name ?? holdInvoice.guestName ?? null,
        link: `/invoices/${holdInvoice.id}`,
      },
    });
    if (sellableItemIds.length === 0 && holdInvoice.itemIds.length > 0) {
      // Nothing on this invoice could be fulfilled: no confirmation email, XP, or live-feed event.
      console.error(`[hold-invoice/${source}] Invoice ${invoiceId}: every item was oversold; payment settled as ${settled.status}, sale not confirmed.`);
      return { recorded: true, alreadyPaid: false, oversoldSettlement: oversoldOutcome };
    }
  }

  // Fire-and-forget: end eBay listings for items now fully sold out (not every
  // bundled item unconditionally -- ADR-085 Track B Phase 1 Step 4)
  setImmediate(() => {
    Promise.allSettled(
      fullySoldOutIds.map((itemId: string) => endEbayListingIfExists(itemId))
    ).catch(() => {});
    Promise.allSettled(
      fullySoldOutIds.map((itemId: string) => markShopifyItemSold(itemId))
    ).catch(() => {});
    Promise.allSettled(
      fullySoldOutIds.map((itemId: string) => withdrawDiscogsListingIfExists(itemId))
    ).catch(() => {});
    Promise.allSettled(
      fullySoldOutIds.map((itemId: string) => withdrawReverbListingIfExists(itemId))
    ).catch(() => {});
    Promise.allSettled(
      fullySoldOutIds.map((itemId: string) => notifyFacebookExportedItemSold(itemId))
    ).catch(() => {});
  });

  // ADR-087 Phase 4: partial sales (not fully sold out) — revise eBay listing
  // quantities for any eBay-linked items in this bundle. Fire-and-forget.
  if (partialSaleUpdates.length) {
    setImmediate(() => {
      Promise.allSettled(
        partialSaleUpdates.map(({ itemId, remainingStock }) =>
          syncMarketplaceStock(itemId, { fullySoldOut: false, remainingStock })
        )
      ).catch(() => {});
    });
  }

  // Award XP to shopper (+15 guildXP for payment completion)
  // Guest invoice: no User row, so no guildXp to award to -- skip entirely rather than
  // calling awardXp with a null id.
  if (holdInvoice.shopperUserId) {
    try {
      const { awardXp, XP_AWARDS } = await import('../services/xpService');
      void XP_AWARDS; // preserved verbatim from the original charge.succeeded handler (unused there too)
      await awardXp(holdInvoice.shopperUserId, 'PAYMENT_COMPLETED', 15, {
        saleId: holdInvoice.saleId,
      });
    } catch (err) {
      console.warn(`[hold-invoice/${source}] Failed to award XP:`, err);
    }
  }

  // Sale Passport / engagement awards (2026-09-29): a Square-paid invoice with a real shopper gets the
  // same purchase XP, milestones, referral reward, OG Buyer badge, achievement and passport stamp as
  // any other purchase. Fire-and-forget AFTER commit, never throws. NOT fired for a fully-cash
  // 'pos-cash' sale (POS rows are skipped by the service anyway) or a guest. Stripe-processor
  // invoices are deliberately excluded: the engagement service keys the "one award per payment"
  // rule on Purchase.squarePaymentId, so on Stripe it would award once per row of a multi-item
  // invoice, and stripeController's payment_intent.succeeded path already owns Stripe awards.
  // DOUBLE-AWARD CHECK: squareWebhookController also fires engagement after markHoldInvoicePaid.
  // That is safe. Both resolve the SAME canonical purchase (earliest PAID row sharing the
  // squarePaymentId), an in-process in-flight map makes a concurrent second call wait for the
  // first, and the service's DB dedupe (PURCHASE_COMPLETED keyed on purchaseId, passport ledger key
  // ACT:MAKE_PURCHASE:<purchaseId>) makes a later call a no-op.
  if (
    processor === 'SQUARE' &&
    externalPaymentId &&
    source !== 'pos-cash' &&
    holdInvoice.shopperUserId &&
    recordedPurchaseIds.length > 0
  ) {
    fireSquarePurchaseEngagement(recordedPurchaseIds[0]);
  }

  // Emit socket event for live dashboard updates
  try {
    const io = getIO();
    const itemSummary = bundledItems.length > 1
      ? `${bundledItems.length} items`
      : bundledItems[0]?.title;

    pushEvent(io, holdInvoice.saleId, {
      type: 'HOLD_RELEASED',
      itemTitle: itemSummary,
      amount: organizerPayout,
      saleId: holdInvoice.saleId,
      timestamp: new Date(),
    });
  } catch (err) {
    console.warn(`[hold-invoice/${source}] Failed to emit socket event:`, err);
  }

  // Send confirmation emails (fire-and-forget)
  setImmediate(() => {
    const fromEmail = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';
    // 2026-09-30: after an oversold partial settlement, name only the kept items and the amount kept.
    const keptItems = oversoldCtx.settlement ? bundledItems.filter((it) => sellableItemIds.includes(it.id)) : bundledItems;
    const itemList = keptItems.length > 1
      ? `${keptItems.length} items from ${holdInvoice.sale!.title}`
      : keptItems[0]?.title;
    const keptTotalCents = oversoldCtx.settlement
      ? Math.max(0, holdInvoice.totalAmount - oversoldCtx.settlement.refundCardCents - oversoldCtx.settlement.cashToReturnCents)
      : holdInvoice.totalAmount;
    const totalPaid = (keptTotalCents / 100).toFixed(2);
    const platformFee = (holdInvoice.platformFeeAmount / 100).toFixed(2);

    // Email to shopper (or guest -- this IS their only durable payment record on our side
    // for a guest invoice, since they have no account/inbox for the notification above).
    const buyerEmailAddress = holdInvoice.shopper?.email ?? holdInvoice.guestEmail ?? null;
    const buyerDisplayName = holdInvoice.shopper?.name ?? holdInvoice.guestName ?? 'there';
    if (buyerEmailAddress) {
      transactionalEmailService.emails.send({
        from: fromEmail,
        to: buyerEmailAddress,
        subject: `Payment confirmed for ${itemList}`,
        html: `
          <h2>Payment Confirmed</h2>
          <p>Hi ${buyerDisplayName},</p>
          <p>Your payment of $${totalPaid} for <strong>${itemList}</strong> has been confirmed.</p>
          <p>The organizer will contact you soon about shipping or pickup details.</p>
          <p style="color: #6b7280; font-size: 14px;">Transaction ID: ${invoiceId.slice(0, 8)}</p>
        `,
      }).catch((err: unknown) => console.warn(`[hold-invoice/${source}] Failed to send shopper email:`, err));
    } else {
      console.warn(`[hold-invoice/${source}] No buyer email on file (invoice ${invoiceId}) -- skipping payment-confirmed email.`);
    }

    // Email to organizer
    // Square changeover (2026-09-10): processor-accurate copy -- `processor` is already in
    // scope from the ExternalPaymentRef destructured at the top of this function (line 204),
    // and is the actual processor this specific invoice was paid through (not an assumption),
    // so no extra lookup is needed. Previously hardcoded "Stripe Connect account" / "Stripe fee"
    // unconditionally, which was wrong for any invoice paid via Square.
    const payoutProcessorLabel = processor === 'SQUARE' ? 'Square' : 'Stripe';
    const payoutAccountPhrase = processor === 'SQUARE' ? 'Square account' : 'Stripe Connect account';
    transactionalEmailService.emails.send({
      from: fromEmail,
      to: holdInvoice.organizer.email,
      subject: `Payment received: ${itemList}`,
      html: `
        <h2>Payment Received</h2>
        <p>Hi ${holdInvoice.organizer.name},</p>
        <p>Payment of $${organizerPayout.toFixed(2)} has been received for <strong>${itemList}</strong>.</p>
        <p>Payout will be transferred to your ${payoutAccountPhrase} within 1-2 business days.</p>
        <p style="color: #6b7280; font-size: 14px;">Platform fee: $${platformFee} | ${payoutProcessorLabel} fee: $${stripeFeeAmount.toFixed(2)}</p>
      `,
    }).catch((err: unknown) => console.warn(`[hold-invoice/${source}] Failed to send organizer email:`, err));
  });

  console.log(`[hold-invoice/${source}] Payment completed for invoice ${invoiceId} (${bundledItems.length} items): organizer payout $${organizerPayout.toFixed(2)}${chargeId ? ` (charge ${chargeId})` : ''}`);

  return { recorded: true, alreadyPaid: false, ...(oversoldOutcome ? { oversoldSettlement: oversoldOutcome } : {}) };
}
