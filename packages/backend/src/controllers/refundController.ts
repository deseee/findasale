import { Response } from 'express';
import * as Sentry from '@sentry/node';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { createNotification } from '../lib/notificationService';
import { planExplicitCardRefund, isBulkRefundError } from '../services/bulkLot/bulkLotRefundService'; // ADR-136 Addendum B (#659): take N cards of a bulk lot sale back
import { executeVerifiedRefund, RefundError, sendRefundConfirmationEmail } from '../services/refundService';
import { executeVerifiedSquareRefund } from '../services/squareRefundService';

/**
 * refundController.ts -- organizer / admin refund endpoint (POST /api/stripe/refund/:purchaseId).
 *
 * Moved out of stripeController.ts on 2026-11-04 when the rest of that file (the Stripe webhook and the
 * Stripe PaymentIntent resume/recovery endpoints) was deleted with Stripe's retirement. The endpoint is
 * processor-agnostic and stays live: SQUARE purchases refund through executeVerifiedSquareRefund, cash /
 * manual purchases are recorded through executeVerifiedRefund, and a historical Stripe card purchase gets
 * a clear STRIPE_CLOSED_MANUAL_REFUND_REQUIRED answer from executeVerifiedRefund (no Stripe call is made).
 * The URL keeps its old /api/stripe prefix so existing clients keep working.
 */

// Issue a refund (organizer or admin only) — P1-3: Refund endpoint with cap + email
export const createRefund = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    const isAdmin = req.user?.roles?.includes('ADMIN') || req.user?.role === 'ADMIN';
    if (!req.user || (!hasOrganizerRole && !isAdmin)) {
      return res.status(403).json({ message: 'Organizer or admin access required' });
    }

    const { purchaseId } = req.params;

    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: {
        user: { select: { id: true, email: true, name: true } },
        sale: {
          include: {
            organizer: { select: { userId: true, businessName: true } }
          }
        },
        item: { select: { title: true } },
      },
    });

    if (!purchase) {
      return res.status(404).json({ message: 'Purchase not found' });
    }

    // Booth-cart purchases have no purchase.saleId (a BoothCartTransaction spans a
    // hub, not one Sale) — ownership for those is checked via the item's vendor
    // booth's hub organizer below, not purchase.sale.organizer.
    const isBoothCartPurchase = !!purchase.boothCartTransactionId;
    if (hasOrganizerRole && !isBoothCartPurchase && purchase.sale?.organizer?.userId !== req.user.id) {
      return res.status(403).json({ message: 'You can only refund purchases from your own sales' });
    }
    if (hasOrganizerRole && isBoothCartPurchase) {
      const cart = await prisma.boothCartTransaction.findUnique({
        where: { id: purchase.boothCartTransactionId! },
        select: { hub: { select: { organizer: { select: { userId: true } } } } },
      });
      if (cart?.hub?.organizer?.userId !== req.user.id) {
        return res.status(403).json({ message: 'You can only refund purchases from your own hub' });
      }
    }

    // P2-2 cap REMOVED (2026-07-29, Patrick decision): this is a seller/admin-initiated
    // refund (organizer refunding their own sale, or an admin acting on their behalf) — the
    // first-month cap exists to blunt NEW-ACCOUNT FRAUD from whoever is REQUESTING a refund,
    // which doesn't apply when the platform/organizer is the one choosing to issue it.
    // Confirmed live 2026-07-29: this cap silently halved a legitimate refund for a genuine
    // double-sale (buyer owed $12, got $6, no warning shown anywhere in the UI) before this
    // was caught and fixed with a manual top-up. applyFirstMonthRefundCap is kept in
    // refundService.ts for a possible future BUYER-initiated self-service refund flow, but is
    // no longer called from this seller/admin-initiated endpoint.
    // PARTIAL REFUNDS (2026-09-29, money review P1-14): the body may carry an optional `amount` (dollars)
    // for a partial refund; without it this refunds the whole REMAINING balance, which for a purchase
    // that was never refunded is exactly purchase.amount, as before. A partial refund leaves the purchase
    // PAID with refundedAmount tracked (see squareRefundService.executeVerifiedSquareRefund), so a second
    // partial refund is allowed up to what is left and the item goes back on sale only once the whole
    // amount has been refunded.
    const alreadyRefundedCents = Math.round((Number(purchase.refundedAmount) || 0) * 100);
    const remainingRefundableCents = Math.max(0, Math.round(purchase.amount * 100) - alreadyRefundedCents);

    // ADR-136 Addendum B (2026-10-05, #659): a bulk lot sale row (Purchase.bulkQuantity = cards) can be refunded by CARD COUNT.
    // Body: { cards?: number, idempotencyKey?: string, amount?: number }. `cards` takes that many MORE cards back and the
    // server works out the money (the cumulative half-up share, so the pieces add up and the last piece is exact); an
    // `amount` sent with it must agree. Without `cards` the existing amount rules apply and the cards that go back follow the
    // money. `idempotencyKey` (8 to 64 of A-Z a-z 0-9 _ : -) makes a repeated click or retry return the first answer instead of
    // refunding the next slice. Every refund path (Square, cash, dispute, admin bulk) shares the same card math.
    const bulkSoldCards = Number(purchase.bulkQuantity) > 0 ? Number(purchase.bulkQuantity) : 0;
    const bulkBody = (req.body ?? {}) as { cards?: unknown; idempotencyKey?: unknown; amount?: unknown };
    const bulkCardsRaw = bulkBody.cards !== undefined && bulkBody.cards !== null && bulkBody.cards !== '' ? bulkBody.cards : undefined;
    const bulkIdempotencyKey =
      bulkSoldCards > 0 && typeof bulkBody.idempotencyKey === 'string' && /^[A-Za-z0-9_:-]{8,64}$/.test(bulkBody.idempotencyKey) ? bulkBody.idempotencyKey : null;
    if (bulkCardsRaw !== undefined && bulkSoldCards === 0) {
      return res.status(400).json({ message: 'That sale is not a bulk lot sale.', code: 'BULK_REFUND_NOT_BULK' });
    }
    if (bulkIdempotencyKey) {
      const priorBulkRefund = await prisma.bulkLotRefund.findUnique({
        where: { purchaseId_idempotencyKey: { purchaseId, idempotencyKey: bulkIdempotencyKey } },
        select: { cents: true, cardsReturned: true, cumulativeCards: true },
      });
      if (priorBulkRefund) {
        return res.json({
          message: 'Refund already recorded',
          replay: true,
          refundAmount: priorBulkRefund.cents / 100,
          originalAmount: purchase.amount,
          isFullRefund: remainingRefundableCents <= 0,
          remainingRefundable: remainingRefundableCents / 100,
          bulk: {
            cardsReturned: priorBulkRefund.cardsReturned,
            returnedCards: Number(purchase.bulkRefundedQuantity) || 0,
            outstandingCards: Math.max(0, bulkSoldCards - (Number(purchase.bulkRefundedQuantity) || 0)),
          },
        });
      }
    }

    if (remainingRefundableCents <= 0) {
      return res.status(400).json({ message: 'This purchase has already been fully refunded' });
    }
    const rawRequestedAmount = (req.body as { amount?: unknown } | undefined)?.amount;
    let requestedRefundCents = remainingRefundableCents;
    if (rawRequestedAmount !== undefined && rawRequestedAmount !== null && rawRequestedAmount !== '') {
      const parsedAmount = Number(rawRequestedAmount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ message: 'Refund amount must be a number greater than zero' });
      }
      requestedRefundCents = Math.round(parsedAmount * 100);
      if (requestedRefundCents > remainingRefundableCents) {
        return res.status(400).json({
          message: 'Refund amount cannot exceed the remaining refundable amount on this purchase',
          remainingRefundable: remainingRefundableCents / 100,
        });
      }
    }
    let bulkCardPlan: ReturnType<typeof planExplicitCardRefund> | undefined;
    if (bulkCardsRaw !== undefined) {
      try {
        bulkCardPlan = planExplicitCardRefund(
          { soldCards: bulkSoldCards, purchaseCents: Math.round(purchase.amount * 100), returnedCards: Number(purchase.bulkRefundedQuantity) || 0, refundedCents: alreadyRefundedCents },
          bulkCardsRaw
        );
      } catch (planErr) {
        if (isBulkRefundError(planErr)) return res.status(planErr.status).json({ message: planErr.message, code: planErr.code });
        throw planErr;
      }
      if (rawRequestedAmount !== undefined && rawRequestedAmount !== null && rawRequestedAmount !== '' && requestedRefundCents !== bulkCardPlan.cents) {
        return res.status(400).json({ message: 'The refund amount did not match the cards. Try again.', code: 'BULK_REFUND_AMOUNT_MISMATCH', expectedAmount: bulkCardPlan.cents / 100 });
      }
      requestedRefundCents = bulkCardPlan.cents;
    }
    const bulkRefundOpts = bulkSoldCards > 0
      ? { bulkCards: bulkCardPlan?.cards, source: (hasOrganizerRole ? 'ORGANIZER' : 'ADMIN') as 'ORGANIZER' | 'ADMIN', actorUserId: req.user.id, idempotencyKey: bulkIdempotencyKey }
      : undefined;

    // Only the Square refund path tracks a running refundedAmount and keeps a partially refunded purchase
    // PAID. The legacy path (executeVerifiedRefund) marks the whole purchase REFUNDED whatever amount it is
    // given, so a partial amount there would strand the purchase in a state that hides the balance still
    // with the buyer. Refuse it rather than record something untrue.
    // ADR-136 Addendum B (2026-10-05, #659): a BULK LOT sale paid in cash, Venmo or Zelle is the one non-Square row that
    // can be refunded in part: executeVerifiedRefund hands it to its own transactional core (executeBulkCashRefund),
    // which tracks the running refunded total and puts back the proportional cards. Every other non-Square row keeps
    // the old rule.
    const isBulkCashRow =
      (purchase.bulkQuantity ?? 0) > 0 &&
      (['CASH', 'MANUAL'].includes(String(purchase.processor ?? '').toUpperCase()) ||
        !purchase.stripePaymentIntentId ||
        purchase.stripePaymentIntentId.startsWith('cash_'));
    if (purchase.processor !== 'SQUARE' && !isBulkCashRow && requestedRefundCents !== remainingRefundableCents) {
      return res.status(400).json({ message: 'Partial refunds are only available for Square purchases. Refund the full amount instead.' });
    }
    const refundAmount = requestedRefundCents / 100;
    const wasCapped = false;
    // True once this refund brings the cumulative refunded total up to the purchase amount.
    let isFullRefund = alreadyRefundedCents + requestedRefundCents >= Math.round(purchase.amount * 100);

    // Refund History (2026-07-29): 'organizer' vs 'admin' mirrors the SAME role check this
    // endpoint already ran above (hasOrganizerRole gates the own-sale ownership check just
    // above; a pure admin with no organizer role skips it). A user with both roles is
    // recorded as 'organizer' since that's the branch whose ownership check actually ran.
    const initiatedBy: 'organizer' | 'admin' = hasOrganizerRole ? 'organizer' : 'admin';

    // Split tender (2026-09-29): a cash + card split sale can only be refunded through Square up to
    // the card leg; the cash leg is handed back by the organizer. Filled from the Square refund
    // result below and relayed in the response (0 / null for every non-split refund).
    let cashPortionToRefundByHand = 0;
    let cashRefundMessage: string | null = null;
    // Card-not-present surcharge (2026-09-30): dollars of the buyer's Card-not-present fee returned with this
    // refund (proportional to the principal refunded; 0 for every purchase without one).
    let surchargeRefundedAmount = 0;
    // ADR-136 Addendum B: cards this refund put back on the lot (bulk lot sale rows only).
    let bulkCardsBack: number | undefined;

    // Money movement lives in the shared choke points: executeVerifiedSquareRefund for Square purchases and
    // executeVerifiedRefund (services/refundService.ts) for cash / manual rows and for historical Stripe rows,
    // which it refuses with STRIPE_CLOSED_MANUAL_REFUND_REQUIRED because Stripe is retired.
    try {
      // purchase.processor decides which choke point this refund routes through. Both throw the SAME
      // RefundError class, so the catch block below handles either.
      if (purchase.processor === 'SQUARE') {
        const squareRefund = await (bulkRefundOpts ? executeVerifiedSquareRefund(purchaseId, refundAmount, initiatedBy, undefined, bulkRefundOpts) : executeVerifiedSquareRefund(purchaseId, refundAmount, initiatedBy));
        bulkCardsBack = squareRefund.bulkCardsReturned;
        cashPortionToRefundByHand = squareRefund.cashPortionToRefundByHand;
        cashRefundMessage = squareRefund.message;
        isFullRefund = squareRefund.isFullRefund;
        surchargeRefundedAmount = squareRefund.surchargeRefundedAmount ?? 0;
      } else {
        const legacyRefund = await (bulkRefundOpts ? executeVerifiedRefund(purchaseId, refundAmount, initiatedBy, undefined, bulkRefundOpts) : executeVerifiedRefund(purchaseId, refundAmount, initiatedBy));
        bulkCardsBack = legacyRefund.bulk?.cardsReturned;
        // Bulk cash rows report whether this refund finished the row (ADR-136 Addendum B); every other legacy refund is whole-row.
        if (legacyRefund.isFullRefund !== undefined) isFullRefund = legacyRefund.isFullRefund;
      }
    } catch (refundErr) {
      if (refundErr instanceof RefundError) {
        return res.status(refundErr.statusCode).json({ message: refundErr.message, ...(refundErr.details || {}) });
      }
      throw refundErr;
    }

    // Restore item to AVAILABLE if it exists -- FULL refunds only (money review P1-14). A partial refund
    // leaves the purchase PAID and the buyer still holds the item, so putting it back on sale would let
    // it be sold twice.
    //
    // GUARDED (2026-09-30): the old unconditional `item.update` could clobber a concurrent re-hold or
    // re-sale of the same item that landed between the refund and this line. Now only the SOLD -> AVAILABLE
    // transition is allowed (an item already re-held or re-sold is left alone), and only while no OTHER
    // PAID purchase of this item exists (so SOLD still belongs to the purchase that was just refunded).
    if (purchase.itemId && isFullRefund) {
      const otherPaidPurchases = await prisma.purchase.count({
        where: { itemId: purchase.itemId, id: { not: purchaseId }, status: 'PAID' },
      });
      if (otherPaidPurchases === 0) {
        // Consignor price tags (2026-10-06): a minted CONSIGNOR_TAG item never returns to the available pool.
        // Single inventory number (2026-10-13): guarded like refundService.ts -- only flips when this refund returned the last
        // sold unit (stockSold is now exactly total - 1), so an unrelated old refund never reopens a manually SOLD multi-unit
        // item. Kits are derived from their components and never flipped here. Raw SQL because Prisma cannot express column arithmetic.
        await prisma.$executeRaw`UPDATE "Item" SET "status" = 'AVAILABLE' WHERE "id" = ${purchase.itemId} AND "status" = 'SOLD' AND "listingType" NOT IN ('CONSIGNOR_TAG', 'KIT') AND "stockSold" = COALESCE("stockTotal", 1) - 1`; 
      }
    }

    // Send confirmation email to shopper (shared helper — see refundService.ts;
    // fire-and-forget, same as before this extraction)
    sendRefundConfirmationEmail({
      toEmail: purchase.user?.email,
      buyerName: purchase.user?.name,
      refundAmount,
      surchargeRefundAmount: surchargeRefundedAmount,
      wasCapped,
      itemTitle: purchase.item?.title,
      organizerBusinessName: purchase.sale?.organizer?.businessName,
      purchaseId,
    });

    // Notification audit fix (2026-08-04): sendRefundConfirmationEmail above is a raw
    // email only -- it never wrote an in-app Notification row, so a buyer who doesn't
    // open the email (or is a guest with no account to log into) had NO record of the
    // refund anywhere in the app itself. Same createNotification shape already used for
    // payment_received above in this file. Guest checkouts have no purchase.userId (see
    // the guest-checkout comment elsewhere in this file), so this only fires for
    // registered buyers -- guests still get the email, which is their only channel.
    if (purchase.userId) {
      createNotification({
        userId: purchase.userId,
        type: 'refund_issued',
        title: 'Refund issued',
        body: `A refund of $${(refundAmount + surchargeRefundedAmount).toFixed(2)} was issued for "${purchase.item?.title || 'item'}"${surchargeRefundedAmount > 0 ? ` (includes the $${surchargeRefundedAmount.toFixed(2)} Card-not-present fee)` : ''}`,
        // Stripe dead-link fix (2026-09-09, findasale-dev BUG MODE): /shopper/purchases is not
        // a real route (404s); purchaseId is the route param already used above (== purchase.id).
        link: `/purchases/${purchaseId}`,
        channel: 'OPERATIONAL',
        sendEmail: false, // sendRefundConfirmationEmail above already sends the email for this event
      }).catch((err) => console.error('[notification] Failed to create refund_issued notification:', err));
    }

    res.json({
      message: 'Refund issued successfully',
      refundAmount,
      wasCapped,
      originalAmount: purchase.amount,
      // Partial refunds (2026-09-29): tells the caller whether the purchase is now fully refunded or still
      // PAID with a balance that can be refunded later.
      isFullRefund,
      remainingRefundable: Math.max(0, (Math.round(purchase.amount * 100) - alreadyRefundedCents - requestedRefundCents) / 100),
      // ADR-136 Addendum B: bulk lot sale rows report the cards put back and how many are still out on the sale.
      ...(bulkSoldCards > 0
        ? {
            bulk: {
              cardsReturned: bulkCardsBack ?? 0,
              returnedCards: (Number(purchase.bulkRefundedQuantity) || 0) + (bulkCardsBack ?? 0),
              outstandingCards: Math.max(0, bulkSoldCards - (Number(purchase.bulkRefundedQuantity) || 0) - (bulkCardsBack ?? 0)),
            },
          }
        : {}),
      // Split tender (2026-09-29): only present when part of the sale was paid in cash.
      ...(cashPortionToRefundByHand > 0 ? { cashPortionToRefundByHand, cashRefundMessage } : {}),
      // Card-not-present surcharge (2026-09-30): only present when part of the fee was returned with this
      // refund. `refundAmount` stays the principal; totalRefundedToBuyer is principal plus the surcharge share.
      ...(surchargeRefundedAmount > 0 ? { surchargeRefundedAmount, totalRefundedToBuyer: refundAmount + surchargeRefundedAmount } : {}),
    });
  } catch (error) {
    // Detail stays server-side (logged here and captured by the error tracker); the client gets a generic
    // message plus a stable code (2026-09-30: the raw error message used to be echoed back).
    console.error('createRefund error:', error);
    try {
      Sentry.captureException(error instanceof Error ? error : new Error(String(error)), { tags: { area: 'create-refund' }, extra: { purchaseId: req.params?.purchaseId } });
    } catch {
      // Sentry may not be initialized -- silently continue
    }
    res.status(500).json({ message: 'We could not issue this refund. Please try again, or contact support if it keeps happening.', code: 'REFUND_FAILED' });
  }
};
