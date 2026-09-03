import { POSPaymentLink } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getPlatformFeeRate, snapshotForCommissionOnly, SubscriptionTier } from '../utils/feeCalculator';
import { sellItemUnits, InsufficientStockError } from '../services/itemStockService';
import { endEbayListingIfExists } from '../controllers/ebayController';
import { markShopifyItemSold } from '../services/shopifyService';
import { notifyFacebookExportedItemSold } from '../services/facebookNudgeService';
import { syncMarketplaceStock } from '../services/marketplaceStockSyncService';
import { createNotification } from '../lib/notificationService';
import { shouldUseDirectCharge } from './stripeConnectService'; // Direct-charges migration (2026-08-08)
import { getStripe } from '../utils/stripe'; // S-POS-QR-DOUBLE-CHARGE (2026-09-02): deactivate the Payment Link post-completion

const stripe = () => getStripe();

/**
 * posPaymentLinkRecorder.ts — ADR pos-webhook-idempotency-reconciliation (2026-07-23, S1151)
 *
 * Single source of truth for recording an in-person POS / QR Payment Link sale:
 * marks items sold, creates Purchase rows, updates the POSPaymentLink, and fires the
 * cross-channel removal hooks (eBay / Shopify / Facebook). Reused by BOTH the Stripe
 * `checkout.session.completed` webhook handler AND the stranded-sale reconciliation cron,
 * so the two callers can never diverge.
 *
 * Idempotency (two layers):
 *   1. Inside a $transaction, the row is re-read and recording only proceeds if
 *      status !== 'COMPLETED'; the flip to COMPLETED happens FIRST so a concurrent
 *      webhook/reconciler tx re-reading the row sees COMPLETED and no-ops.
 *   2. Purchase rows key on stripePaymentIntentId + itemId, protected by the compound
 *      partial unique (stripePaymentIntentId, itemId); a race that reaches the insert is
 *      caught per-item as P2002 and treated as already-recorded.
 *
 * Real PaymentIntent id (fixed 2026-08-26): stripePaymentIntentId is now the REAL Stripe
 * PaymentIntent id (`pi_...`), passed in by the caller via opts.paymentIntentId -- both
 * callers (stripeController.ts's checkout.session.completed webhook and
 * posStrandedSaleReconcileCron.ts's reconcile branch) already have a real Stripe Checkout
 * Session object in hand and extract session.payment_intent from it, mirroring the exact
 * idiom used elsewhere in stripeController.ts and holdInvoicePaymentRecorder.ts (the correct
 * reference pattern for this fix). Previously this wrote a synthetic `pos_<linkId>` placeholder,
 * which refundService.ts's executeVerifiedRefund then passed straight to
 * stripe().refunds.create({ payment_intent: ... }) -- a call that always failed, silently
 * breaking refunds for every POS Payment Link sale. The compound unique index above is what
 * makes this safe: it was never actually the synthetic string that provided idempotency, a
 * real PI shared across multiple items' Purchase rows already works elsewhere in this
 * codebase (Cart Checkout's multi-item sessions, holdInvoicePaymentRecorder.ts). The synthetic
 * `pos_${fresh.id}` string is kept ONLY as a defensive last-resort fallback for the rare case
 * a caller cannot supply a real PaymentIntent id -- see the fallback branch below, which logs
 * a warning whenever it fires, since it means a caller is missing data it should have.
 */

export interface RecordPosPaymentLinkSaleOpts {
  source: 'webhook' | 'reconcile';
  sessionId?: string;
  /**
   * The REAL Stripe PaymentIntent id (`pi_...`) for this sale, when the caller has it
   * (both current callers do -- see the docblock above). Used as Purchase.stripePaymentIntentId
   * instead of the synthetic `pos_<linkId>` fallback so refundService.ts's
   * executeVerifiedRefund can actually refund the charge. Falls back to the synthetic id
   * (with a warning logged) only if a caller genuinely cannot supply one.
   */
  paymentIntentId?: string;
}

export interface RecordPosPaymentLinkSaleResult {
  /** true only if THIS call performed the recording (flipped ACTIVE -> COMPLETED). */
  recorded: boolean;
  /** true if the link was already COMPLETED when this call ran (idempotent no-op). */
  alreadyCompleted: boolean;
  purchaseIds: string[];
  /**
   * findasale-hacker adversarial pass, 2026-08-06 (Path A/B/C reclaim-fix review):
   * items where Stripe genuinely captured payment for THIS link, but sellItemUnits()
   * threw InsufficientStockError because the item was already sold via a different
   * channel/buyer by the time this call ran (e.g. posStrandedSaleReconcileCron.ts's
   * expiry-reclaim branch reverted this exact item to RESERVED after this link's own
   * expiresAt passed, it was resold to someone else, and THIS link's best-effort Stripe
   * deactivation call then failed -- letting the original buyer complete a real payment
   * on a link with no deliverable item left). Real money was captured; no Purchase row
   * was created for it (see fix below) to avoid a false/duplicate fulfillment record.
   * Needs organizer/admin manual refund review.
   */
  oversoldItemIds: string[];
}

export async function recordPosPaymentLinkSale(
  posPaymentLink: POSPaymentLink,
  opts: RecordPosPaymentLinkSaleOpts
): Promise<RecordPosPaymentLinkSaleResult> {
  const { source, paymentIntentId } = opts;

  // Fast path — already recorded before we even open a transaction.
  if (posPaymentLink.status === 'COMPLETED') {
    return { recorded: false, alreadyCompleted: true, purchaseIds: [], oversoldItemIds: [] };
  }

  const fullySoldOutIds: string[] = [];
  const partialSaleUpdates: { itemId: string; remainingStock: number }[] = [];
  const oversoldItemIds: string[] = [];
  let purchaseIds: string[] = [];
  let didRecord = false;
  // S-POS-QR-DOUBLE-CHARGE (2026-09-02): captured inside the tx below so the
  // post-tx Payment Link deactivation call (outside the tx, fire-and-forget) uses
  // the SAME Direct-vs-Destination routing decision this recording pass already made,
  // rather than recomputing it a second time.
  let recordedStripeAccountId: string | null = null;
  let recordedUseDirect = false;

  await prisma.$transaction(async (tx) => {
    // Guarded atomic flip: the WHERE clause + UPDATE row lock is what actually
    // serializes a concurrent webhook/reconciler race — a plain SELECT here would not
    // lock the row under READ COMMITTED, letting both transactions read stale status.
    // (Fixed 2026-08-03, findasale-hacker pass — same race class found in
    // holdInvoicePaymentRecorder.ts; this file was the original reference pattern
    // and had the identical findUnique-then-update TOCTOU gap.)
    const flip = await tx.pOSPaymentLink.updateMany({
      where: { id: posPaymentLink.id, status: { not: 'COMPLETED' } },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    if (flip.count === 0) {
      return; // another path already recorded this sale — lost the race, no-op
    }
    didRecord = true;

    // Safe to re-read now — this tx already won the atomic flip above.
    const fresh = await tx.pOSPaymentLink.findUnique({ where: { id: posPaymentLink.id } });
    if (!fresh) {
      return; // unreachable in practice (we just updated this row), defensive only
    }

    // Look up organizer tier + Connect id for fee calculation and Direct-charge routing.
    // Hoisted out of the itemIds-only branch (2026-08-28 income-tracking fix, S-POS-MISC-
    // CHARGE-PURCHASE-GAP): both the per-item path AND the misc/quick-add path below need
    // this same fee-rate + charge-routing decision, so it must run regardless of whether
    // fresh.itemIds is populated.
    const posOrganizerLookup = fresh.saleId
      ? await tx.sale.findUnique({
          where: { id: fresh.saleId },
          select: { organizerId: true, organizer: { select: { subscriptionTier: true, stripeConnectId: true } } },
        })
      : null;
    const posOrganizerTier = posOrganizerLookup?.organizer?.subscriptionTier ?? null;
    const posFeeRate = getPlatformFeeRate(posOrganizerTier as SubscriptionTier);

    // Stripe account snapshot (2026-08-20 migration: 20260820190000_add_pos_payment_
    // link_stripe_account_snapshot): prefer the value pinned on the link itself at
    // creation time. Only a pre-migration row (chargeType NULL) recomputes the SAME
    // live-Stripe-eligibility + allowlist check (posController.createPaymentLinkInternal
    // already ran it once when the Payment Link itself was created) -- mirrors
    // holdInvoicePaymentRecorder.ts's identical chargeType-NULL fallback shape. The
    // recompute path can still disagree with the original decision if eligibility or the
    // allowlist changed in the window between link creation and completion; the pinned
    // path (the common case going forward) cannot.
    const posStripeConnectId = fresh.stripeAccountId ?? posOrganizerLookup?.organizer?.stripeConnectId ?? null;
    let posUseDirect: boolean;
    if (fresh.chargeType) {
      posUseDirect = fresh.chargeType === 'DIRECT';
    } else {
      posUseDirect = !!(posOrganizerLookup?.organizerId && posStripeConnectId
        ? await shouldUseDirectCharge(posOrganizerLookup.organizerId, posStripeConnectId)
        : false);
    }
    recordedStripeAccountId = posStripeConnectId;
    recordedUseDirect = posUseDirect;

    // Defensive fallback: real PaymentIntent id should always be present from both current
    // callers (see docblock above). If it's ever missing, fall back to the synthetic
    // `pos_<linkId>` placeholder rather than writing a null/blank stripePaymentIntentId --
    // but log loudly, since it means a caller is missing data it should have and refunds
    // for this Purchase will fail exactly like the pre-fix bug this change closes.
    const resolvedPaymentIntentId = paymentIntentId || `pos_${fresh.id}`;
    if (!paymentIntentId) {
      console.warn(`[pos-record/${source}] No real PaymentIntent id supplied for link ${fresh.id} -- falling back to synthetic placeholder '${resolvedPaymentIntentId}'. Refunds for this Purchase will FAIL until this is fixed.`);
    }

    if (fresh.itemIds?.length) {
      // ADR-085 Track B Phase 1 Step 4: atomic, race-safe stock decrement. Collects which
      // items are now fully sold out so the cross-channel removal hooks (fired outside the
      // tx below) only touch those, not every item unconditionally.
      //
      // findasale-hacker fix (2026-08-06, Path A/B/C adversarial pass): sellableItemIds
      // tracks ONLY items where sellItemUnits actually succeeded above. Previously the
      // Purchase-row loop below used fresh.itemIds unconditionally, so an item that threw
      // InsufficientStockError here (Stripe genuinely captured payment for this link, but
      // the item was already sold via a different channel/buyer by the time this ran --
      // the exact double-fulfillment window opened up by the 2026-08-04 reclaim-expiry fix
      // in posStrandedSaleReconcileCron.ts) still got a status:'PAID' Purchase row created
      // for it. That falsely represented the item as fulfilled by this payment (hiding the
      // fact a refund is owed to the original buyer) and, if ever summed, would double-count
      // revenue for one physical unit. Only sellableItemIds get a Purchase row now;
      // oversoldItemIds are surfaced via organizer notification below instead.
      const sellableItemIds: string[] = [];
      for (const posItemId of fresh.itemIds) {
        try {
          const { fullySoldOut, remainingStock } = await sellItemUnits(posItemId, 1, tx);
          if (fullySoldOut) fullySoldOutIds.push(posItemId);
          else partialSaleUpdates.push({ itemId: posItemId, remainingStock });
          sellableItemIds.push(posItemId);
        } catch (stockErr: any) {
          if (stockErr instanceof InsufficientStockError) {
            console.error(`[pos-record/${source}] Oversold race on item ${posItemId} -- Stripe captured payment for link ${fresh.id} but the item was already sold via another channel; NOT creating a PAID Purchase row for it (would misrepresent fulfillment). Flagged for manual refund review:`, stockErr.message);
            oversoldItemIds.push(posItemId);
          } else {
            throw stockErr;
          }
        }
      }

      const items = sellableItemIds.length
        ? await tx.item.findMany({ where: { id: { in: sellableItemIds } } })
        : [];

      const createdPurchaseIds: string[] = [];
      for (const item of items) {
        try {
          const purchase = await tx.purchase.create({
            data: {
              itemId: item.id,
              saleId: fresh.saleId,
              amount: item.price || 0,
              platformFeeAmount: parseFloat(((item.price || 0) * posFeeRate).toFixed(2)),
              // FEE SNAPSHOT (2026-08-17): commission-only — a POS payment link never sells an
              // auction lot. Pinning posFeeRate here also pins WHICH tier decision was live at
              // completion time, which this recorder otherwise recomputes (see the note above).
              ...snapshotForCommissionOnly((item.price || 0) * posFeeRate, posFeeRate),
              status: 'PAID',
              source: 'POS',
              stripePaymentIntentId: resolvedPaymentIntentId,
              chargeType: posUseDirect ? 'DIRECT' : 'DESTINATION',
              ...(posUseDirect && posStripeConnectId ? { stripeAccountId: posStripeConnectId } : {}),
            },
          });
          createdPurchaseIds.push(purchase.id);
        } catch (purchaseErr: any) {
          // Compound partial unique (stripePaymentIntentId, itemId) backstop: a
          // webhook/reconciler race that both reach the insert can't double-create.
          if (purchaseErr.code === 'P2002') {
            console.warn(`[pos-record/${source}] Purchase already exists for item ${item.id} on link ${fresh.id} — treating as already recorded.`);
          } else {
            throw purchaseErr;
          }
        }
      }
      purchaseIds = createdPurchaseIds;

      if (createdPurchaseIds.length) {
        await tx.pOSPaymentLink.update({
          where: { id: fresh.id },
          data: { purchaseIds: createdPurchaseIds },
        });
      }
    } else if (fresh.amount > 0) {
      // Misc/quick-add charge — no linked inventory item, but real money was captured at
      // Stripe (correct application_fee_amount collected). Income-tracking fix (2026-08-28,
      // S-POS-MISC-CHARGE-PURCHASE-GAP): before this branch existed, this case silently
      // created ZERO Purchase row — Stripe had the money and the correct platform commission,
      // but FindA.Sale's own Purchase table, revenue analytics, and dispute/refund handling
      // had no record the sale ever happened. Purchase.itemId is nullable specifically to
      // support this case (confirmed via architect schema review — no migration needed).
      const miscAmount = fresh.amount / 100;
      const miscFeeAmount = parseFloat((miscAmount * posFeeRate).toFixed(2));
      try {
        const purchase = await tx.purchase.create({
          data: {
            itemId: null,
            saleId: fresh.saleId,
            amount: miscAmount,
            platformFeeAmount: miscFeeAmount,
            ...snapshotForCommissionOnly(miscFeeAmount, posFeeRate),
            status: 'PAID',
            source: 'POS',
            stripePaymentIntentId: resolvedPaymentIntentId,
            chargeType: posUseDirect ? 'DIRECT' : 'DESTINATION',
            ...(posUseDirect && posStripeConnectId ? { stripeAccountId: posStripeConnectId } : {}),
          },
        });
        purchaseIds = [purchase.id];
        await tx.pOSPaymentLink.update({
          where: { id: fresh.id },
          data: { purchaseIds: [purchase.id] },
        });
      } catch (purchaseErr: any) {
        if (purchaseErr.code === 'P2002') {
          console.warn(`[pos-record/${source}] Misc-charge Purchase already exists for link ${fresh.id} — treating as already recorded.`);
        } else {
          throw purchaseErr;
        }
      }
    }
  });

  // S-POS-QR-DOUBLE-CHARGE (2026-09-02) defense-in-depth: deactivate the Stripe Payment
  // Link itself right after we record the first completion, so it can never be paid a
  // second time even in a narrow race the Stripe-side completed_sessions.limit:1
  // restriction (set at creation, posController.ts createPaymentLinkInternal) doesn't
  // fully close. Fire-and-forget / non-fatal: a Stripe hiccup here must never block
  // recording a real sale that already happened.
  if (didRecord) {
    setImmediate(() => {
      stripe()
        .paymentLinks.update(
          posPaymentLink.stripePaymentLinkId,
          { active: false },
          recordedUseDirect && recordedStripeAccountId ? { stripeAccount: recordedStripeAccountId } : undefined
        )
        .catch((err: any) => {
          console.warn(`[pos-record/${source}] Failed to deactivate Stripe Payment Link ${posPaymentLink.stripePaymentLinkId} after recording sale (link ${posPaymentLink.id}) -- link may still be technically payable a second time until it expires:`, err?.message ?? err);
        });
    });
  }

  // Fire-and-forget cross-channel removal hooks — OUTSIDE the tx.
  if (fullySoldOutIds.length) {
    setImmediate(() => {
      Promise.allSettled(fullySoldOutIds.map((itemId) => endEbayListingIfExists(itemId))).catch(() => {});
      Promise.allSettled(fullySoldOutIds.map((itemId) => markShopifyItemSold(itemId))).catch(() => {});
      Promise.allSettled(fullySoldOutIds.map((itemId) => notifyFacebookExportedItemSold(itemId))).catch(() => {});
    });
  }
  // ADR-087 Phase 4: partial sales (not fully sold out) — revise eBay listing quantities.
  if (partialSaleUpdates.length) {
    setImmediate(() => {
      Promise.allSettled(
        partialSaleUpdates.map(({ itemId, remainingStock }) =>
          syncMarketplaceStock(itemId, { fullySoldOut: false, remainingStock })
        )
      ).catch(() => {});
    });
  }

  if (didRecord) {
    console.log(`[pos-record/${source}] Payment link completed: ${posPaymentLink.stripePaymentLinkId} (link ${posPaymentLink.id})`);
  }

  // findasale-hacker fix (2026-08-06): surface oversold/already-sold-elsewhere captures to
  // the organizer so a real Stripe payment with no matching Purchase record never goes
  // unnoticed. Fire-and-forget, non-fatal -- mirrors the pattern used for the cross-channel
  // removal hooks above and the STRANDED-UNRECOVERED / AUTO-RECORDED notifications in
  // posStrandedSaleReconcileCron.ts.
  if (oversoldItemIds.length) {
    setImmediate(async () => {
      try {
        const [organizer, oversoldItems] = await Promise.all([
          prisma.organizer.findUnique({
            where: { id: posPaymentLink.organizerId },
            select: { userId: true },
          }),
          prisma.item.findMany({
            where: { id: { in: oversoldItemIds } },
            select: { id: true, title: true },
          }),
        ]);
        if (!organizer?.userId) {
          console.error(`[pos-record/${source}] Could not resolve organizer for oversold-payment notification, link=${posPaymentLink.id}, items=${oversoldItemIds.join(',')}`);
          return;
        }
        const titles = oversoldItems.map((i) => `"${i.title}"`).join(', ') || oversoldItemIds.join(', ');
        await createNotification({
          userId: organizer.userId,
          type: 'POS_PAYMENT_NEEDS_REFUND_REVIEW',
          title: 'Payment captured for an already-sold item: refund review needed',
          body: `A shopper's payment link for ${titles} was completed at Stripe, but the item had already been sold through another channel by the time FindA.Sale tried to record it. FindA.Sale did NOT record a duplicate sale. Please check your Stripe dashboard for the payment on link ${posPaymentLink.stripePaymentLinkId}${opts.sessionId ? ` (session ${opts.sessionId})` : ''} and issue a refund if appropriate.`,
          link: '/organizer/pos',
          channel: 'OPERATIONAL',
        });
      } catch (notifErr) {
        console.error(`[pos-record/${source}] Failed to send oversold-payment notification for link=${posPaymentLink.id}:`, notifErr);
      }
    });
  }

  return { recorded: didRecord, alreadyCompleted: false, purchaseIds, oversoldItemIds };
}
