import { POSPaymentLink } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getInclusivePlatformFeeRate, calculateInclusiveCommissionCents, snapshotForCommissionOnly, SubscriptionTier } from '../utils/feeCalculator'; // inclusive-fee migration (2026-09-24, Patrick ruling): this recorder completes the SAME payment-link flow posController.createPaymentLinkInternal creates (buyer pays remotely via hosted checkout) -- ONLINE channel
import { sellItemUnits, InsufficientStockError } from '../services/itemStockService';
import { endEbayListingIfExists } from '../controllers/ebayController';
import { markShopifyItemSold } from '../services/shopifyService';
import { withdrawDiscogsListingIfExists } from '../services/marketplace/discogsListingConnector';
import { withdrawReverbListingIfExists } from '../services/marketplace/reverbConnector'; // 2026-09-23: withdraw Reverb listing on SOLD, beside Discogs
import { notifyFacebookExportedItemSold } from '../services/facebookNudgeService';
import { syncMarketplaceStock } from '../services/marketplaceStockSyncService';
import { createNotification } from '../lib/notificationService';
import { shouldUseDirectCharge } from './stripeConnectService'; // Direct-charges migration (2026-08-08)
import { getStripe } from '../utils/stripe'; // S-POS-QR-DOUBLE-CHARGE (2026-09-02): deactivate the Payment Link post-completion
import { deleteSquareCheckoutLink } from './squareCheckoutLinkService'; // Square changeover Wave S2 #4 follow-up (2026-09-09): processor-aware post-record deactivation

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
 * PaymentIntent id (`pi_...`), passed in by the caller via opts.externalPaymentId (renamed
 * from opts.paymentIntentId in the Square changeover Wave S1 generalization, 2026-09-09) --
 * both STRIPE callers (stripeController.ts's checkout.session.completed webhook and
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
   * Square changeover Wave S1 (2026-09-09): generalized from a Stripe-only optional
   * `paymentIntentId` to a `{ processor, externalPaymentId }` pair so this recorder can be
   * called for a Square-paid POSPaymentLink once Wave S2 #4 wires Square into
   * posController.ts's createPaymentLinkInternal. Signature/branching change ONLY -- every
   * existing STRIPE call site is unchanged in behavior (still writes
   * Purchase.stripePaymentIntentId exactly as before, including the synthetic-id fallback
   * below); a SQUARE call writes Purchase.squarePaymentId instead. See
   * claude_docs/feature-notes/square-changeover-remaining-work-scoping-2026-09-09.md Section
   * 1.4 Wave S1.
   */
  processor: 'STRIPE' | 'SQUARE';
  /**
   * The REAL Stripe PaymentIntent id (`pi_...`) or Square Payment id for this sale, when the
   * caller has it (both current STRIPE callers do -- see the docblock above). Used as
   * Purchase.stripePaymentIntentId/Purchase.squarePaymentId instead of the synthetic
   * `pos_<linkId>` fallback so refundService.ts's executeVerifiedRefund can actually refund
   * the charge. Falls back to the synthetic id (with a warning logged) only if a caller
   * genuinely cannot supply one.
   */
  externalPaymentId?: string;
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
  const { source, processor, externalPaymentId } = opts;

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
  // payment_received notification fix (2026-09-16): captured inside the tx for use by
  // the fire-and-forget organizer notification below, same capture-inside-tx/use-outside
  // idiom already used for recordedStripeAccountId/recordedUseDirect above.
  let recordedSaleId: string | null = null;
  let recordedAmountCents = 0;
  let recordedItemTitles: string[] = [];

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

    // payment_received notification fix (2026-09-16): capture what the fire-and-forget
    // success notification below needs -- this closure's `fresh`/`items` are out of scope
    // once the tx returns.
    recordedSaleId = fresh.saleId;
    recordedAmountCents = fresh.amount;

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
    const posFeeRate = getInclusivePlatformFeeRate(posOrganizerTier as SubscriptionTier, 'ONLINE');

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
    const resolvedPaymentIntentId = externalPaymentId || `pos_${fresh.id}`;
    if (!externalPaymentId) {
      console.warn(`[pos-record/${source}] No real ${processor === 'SQUARE' ? 'Square Payment' : 'Stripe PaymentIntent'} id supplied for link ${fresh.id} -- falling back to synthetic placeholder '${resolvedPaymentIntentId}'. Refunds for this Purchase will FAIL until this is fixed.`);
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

      // Inclusive-fee migration (2026-09-24): the floor must apply ONCE to the whole
      // payment link's recorded item subtotal, not per item below -- summing a per-item
      // floor would overcharge a multi-item link where each item is individually tiny but
      // the link's total is already well above the floor. Allocated proportionally with the
      // last item absorbing the rounding remainder, same exact-sum pattern used everywhere
      // else in this migration (posPaymentController.ts, reservationController.ts).
      const itemsSubtotalCents = Math.round(items.reduce((sum, it) => sum + (it.price || 0), 0) * 100);
      const totalItemsFeeCents = calculateInclusiveCommissionCents(
        itemsSubtotalCents,
        posOrganizerTier as SubscriptionTier,
        'ONLINE'
      );
      let remainingItemsFeeCentsToAllocate = totalItemsFeeCents;

      const createdPurchaseIds: string[] = [];
      for (let itemIdx = 0; itemIdx < items.length; itemIdx++) {
        const item = items[itemIdx];
        const itemPriceCents = Math.round((item.price || 0) * 100);
        const isLastRecordedItem = itemIdx === items.length - 1;
        const itemFeeCents = isLastRecordedItem
          ? remainingItemsFeeCentsToAllocate
          : Math.min(
              remainingItemsFeeCentsToAllocate,
              itemsSubtotalCents > 0 ? Math.round(totalItemsFeeCents * (itemPriceCents / itemsSubtotalCents)) : 0
            );
        remainingItemsFeeCentsToAllocate -= itemFeeCents;
        const itemFeeAmount = itemFeeCents / 100;
        try {
          const purchase = await tx.purchase.create({
            data: {
              itemId: item.id,
              saleId: fresh.saleId,
              amount: item.price || 0,
              platformFeeAmount: itemFeeAmount,
              // FEE SNAPSHOT (2026-08-17): commission-only — a POS payment link never sells an
              // auction lot. Pinning posFeeRate here also pins WHICH tier decision was live at
              // completion time, which this recorder otherwise recomputes (see the note above).
              ...snapshotForCommissionOnly(itemFeeAmount, posFeeRate),
              status: 'PAID',
              source: 'POS',
              processor,
              ...(processor === 'SQUARE'
                ? { squarePaymentId: resolvedPaymentIntentId }
                : { stripePaymentIntentId: resolvedPaymentIntentId }),
              chargeType: posUseDirect ? 'DIRECT' : 'DESTINATION',
              ...(posUseDirect && posStripeConnectId ? { stripeAccountId: posStripeConnectId } : {}),
            },
          });
          createdPurchaseIds.push(purchase.id);
          recordedItemTitles.push(item.title);
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
      const miscFeeAmount = calculateInclusiveCommissionCents(fresh.amount, posOrganizerTier as SubscriptionTier, 'ONLINE') / 100;
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
            processor,
            ...(processor === 'SQUARE'
              ? { squarePaymentId: resolvedPaymentIntentId }
              : { stripePaymentIntentId: resolvedPaymentIntentId }),
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
      // Square changeover Wave S2 #4 follow-up (2026-09-09): this call used to be
      // unconditionally Stripe -- for a SQUARE-processor link, posPaymentLink.stripePaymentLinkId
      // is null (POSPaymentLink's Stripe columns were relaxed to nullable for exactly this case,
      // see schema.prisma's own comment), so the old unconditional call would have misfired
      // against Stripe with a garbage/undefined id. Branch on processor instead, mirroring the
      // Purchase-row processor branch a few lines up.
      if (posPaymentLink.processor === 'SQUARE') {
        if (!posPaymentLink.squarePaymentLinkId) {
          console.warn(`[pos-record/${source}] SQUARE-processor link ${posPaymentLink.id} has no squarePaymentLinkId -- cannot deactivate; link may still be technically payable a second time until it expires.`);
          return;
        }
        deleteSquareCheckoutLink({
          organizerId: posPaymentLink.organizerId,
          paymentLinkId: posPaymentLink.squarePaymentLinkId,
        })
          .then((result) => {
            if (!result.ok) {
              console.warn(`[pos-record/${source}] Failed to cancel Square payment link ${posPaymentLink.squarePaymentLinkId} after recording sale (link ${posPaymentLink.id}) -- link may still be technically payable a second time until it expires: ${result.code} -- ${result.message}`);
            }
          })
          .catch((err: any) => {
            console.warn(`[pos-record/${source}] Failed to cancel Square payment link ${posPaymentLink.squarePaymentLinkId} after recording sale (link ${posPaymentLink.id}) -- link may still be technically payable a second time until it expires:`, err?.message ?? err);
          });
        return;
      }
      stripe()
        .paymentLinks.update(
          posPaymentLink.stripePaymentLinkId!,
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
      Promise.allSettled(fullySoldOutIds.map((itemId) => withdrawDiscogsListingIfExists(itemId))).catch(() => {});
      Promise.allSettled(fullySoldOutIds.map((itemId) => withdrawReverbListingIfExists(itemId))).catch(() => {});
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
    // Square changeover Wave S2 #4 follow-up (2026-09-09): log the processor-appropriate
    // external id instead of always naming a (possibly null, for SQUARE) stripePaymentLinkId.
    const externalLinkRef = posPaymentLink.processor === 'SQUARE' ? posPaymentLink.squarePaymentLinkId : posPaymentLink.stripePaymentLinkId;
    console.log(`[pos-record/${source}] Payment link completed: ${externalLinkRef} (link ${posPaymentLink.id})`);
  }

  // Notification-gap fix (2026-09-16): confirmed live in production -- a real customer's
  // completed Square Payment Link sale ($89.99+shipping, item correctly flipped SOLD, eBay
  // listing correctly withdrawn) never notified the organizer at all, in-app or email. This
  // recorder only ever called createNotification() for the OVERSOLD edge case below --
  // the ordinary, successful, non-oversold completion path (every normal POS Payment Link /
  // QR sale, across every caller: the Stripe webhook, the Square webhook, and this
  // reconciliation cron) had no organizer notification at all. Fire-and-forget / non-fatal,
  // matching the oversold block's own .catch() below -- a notification failure must never
  // retroactively fail a sale that already recorded successfully. Shape mirrors the
  // established payment_received pattern (stripeController.ts's payment_intent.succeeded /
  // cart-checkout branches, holdInvoicePaymentRecorder.ts).
  if (didRecord && recordedAmountCents > 0) {
    setImmediate(async () => {
      try {
        const organizer = await prisma.organizer.findUnique({
          where: { id: posPaymentLink.organizerId },
          select: { userId: true },
        });
        if (!organizer?.userId) {
          console.error(`[pos-record/${source}] Could not resolve organizer for payment_received notification, link=${posPaymentLink.id}`);
          return;
        }
        const itemsLabel = recordedItemTitles.length === 1
          ? `"${recordedItemTitles[0]}"`
          : recordedItemTitles.length > 1
            ? `${recordedItemTitles.length} items`
            : 'a POS payment link sale';
        await createNotification({
          userId: organizer.userId,
          type: 'payment_received',
          title: 'Payment received',
          body: `Payment of $${(recordedAmountCents / 100).toFixed(2)} received for ${itemsLabel}`,
          link: recordedSaleId ? `/organizer/sales/${recordedSaleId}` : '/organizer/pos',
          channel: 'OPERATIONAL',
          sendEmail: true,
        });
      } catch (notifErr) {
        console.error(`[pos-record/${source}] Failed to send payment_received notification for link=${posPaymentLink.id}:`, notifErr);
      }
    });
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
