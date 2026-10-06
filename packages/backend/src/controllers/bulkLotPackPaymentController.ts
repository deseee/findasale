import { Response } from 'express';
import crypto from 'crypto';
import * as Sentry from '@sentry/node';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { BULK_LOT_MESSAGES, BulkLotDb, isBulkLotError } from '../services/bulkLot/bulkLotService';
import { loadLotPackSizes, planPackLine } from '../services/bulkLot/bulkLotPackService';
import {
  PackCheckoutDeps,
  PackCheckoutDb,
  PackRefundResult,
  assertPackSellableOnline,
  computePackFees,
  executePackCheckout,
  packBuyerKey,
  packClientTransactionId,
  parsePackClientToken,
} from '../services/bulkLot/bulkLotPackCheckout';
import { parsePackCount } from '../services/bulkLot/bulkLotPacks';
import { formatCents } from '../services/bulkLot/bulkLotPricing';
import { reconcileBulkLotEbayInBackgroundIfEnabled } from '../services/bulkLot/bulkLotEbayWiring';
import { computeOversoldSettlement, notifyOversoldSettlement, settleOversoldPayment } from '../services/oversoldPaymentRefundService';
import { createNotification } from '../lib/notificationService';
import { generateReceipt } from '../services/receiptService';
import { checkPaymentDuplicate, storePaymentFingerprint, logPaymentDuplicateWarning } from '../services/paymentDeduplicationService';
import { getInclusivePlatformFeeRate } from '../utils/feeCalculator';
import { sellItemUnitsInTransaction } from '../services/itemStockService';
import { fanOutItemSoldWithdrawals } from '../services/soldFanOutService';
import { syncMarketplaceStock } from '../services/marketplaceStockSyncService';
import { assertCheckoutAllowed, assertGuestCheckoutAllowed, recordConfirmedSignal, CheckoutGuardError } from '../services/checkoutGuard';
import { assertSaleCanAcceptSquarePayment } from '../services/squarePaymentEligibilityService';
import { checkGuestCheckoutVelocity, recordGuestCheckoutFailure, hashForVelocity } from '../services/guestCheckoutVelocityGuard';
import { getClientIp } from '../utils/getClientIp';
import { resolveOrganizerSquareAccessToken, SquareOnboardingIncompleteError, buildSquareIdempotencyKey, createSquareCharge } from '../services/squarePaymentService';
import { applyCashDebtToAppFee, settleCashDebtCollection, releaseCashDebtClaim } from '../services/cashFeeService';
import { recordAffiliateConversion, resolveAffiliateAttribution } from '../services/creatorAffiliateService';
import { fireSquarePurchaseEngagement } from '../services/squarePurchaseEngagementService';

/**
 * Online purchase of a bulk lot PACK (ADR-136 Addendum E, roadmap #659). A lot that has a pack size is bought online as N whole
 * packs, so the shopper never types a number of cards and the charge is always a whole multiple of the pack price the server
 * computed. Everything here sits behind CARD_BULK_LOTS_ENABLED (the caller, createSquarePayment, only hands a request to this
 * module when the flag is on and the lot has a pack size). A lot WITHOUT a pack size keeps the old refusal, untouched.
 *
 * What a pack purchase is, deliberately smaller than a single item checkout:
 *   - pickup only (no shipping: a pack has no confirmed shipping weight)
 *   - no coupon and no item discount (both assume one unit)
 *   - no buyer premium (a lot is never an auction)
 *   - no tax line (the single item checkout has none either)
 *   - one lot per payment (the cart checkout still refuses lots, see createSquareCartPayment)
 * The money rules, duplicate protection and the failure handling live in services/bulkLot/bulkLotPackCheckout.ts.
 */

function sendBulkError(res: Response, err: { status: number; message: string; code: string; extra?: Record<string, unknown> }) {
  return res.status(err.status).json({ message: err.message, code: err.code, ...(err.extra ?? {}) });
}

/**
 * Called by createSquarePayment after it has checked itemId and sourceId and before the old bulk lot refusal. Returns true when
 * this module answered the request (the lot has a pack size), false when the caller should carry on with its normal path (not a
 * lot, a lot with no pack size, or the pack size lookup failed: the old refusal repeats its own, fail closed, check).
 */
export async function tryHandleBulkPackPayment(req: AuthRequest, res: Response): Promise<boolean> {
  const itemId = (req.body as { itemId?: unknown } | undefined)?.itemId;
  if (typeof itemId !== 'string' || !itemId) return false;
  let packSize: number | null | undefined;
  try {
    const sizes = await loadLotPackSizes(prisma as unknown as BulkLotDb, [itemId], true);
    packSize = sizes.get(itemId);
  } catch {
    return false;
  }
  if (typeof packSize !== 'number') return false;
  await handleBulkPackPayment(req, res, packSize);
  return true;
}

export async function handleBulkPackPayment(req: AuthRequest, res: Response, packSize: number): Promise<Response | void> {
  try {
    const body = (req.body ?? {}) as Record<string, any>;
    const { itemId, sourceId, affiliateLinkId, shippingRequested, couponCode, guestEmail, guestName, deviceFingerprint, verificationToken } = body;

    if (!sourceId || typeof sourceId !== 'string' || !sourceId.trim()) {
      return res.status(400).json({ message: 'A tokenized payment source is required.' });
    }
    // The retry token is what lets the server tell a double click from two real orders. A client without one is refused.
    const clientToken = parsePackClientToken(body.clientToken);
    if (!clientToken) return sendBulkError(res, { status: 400, message: BULK_LOT_MESSAGES.BULK_PACK_RETRY_TOKEN, code: 'BULK_PACK_RETRY_TOKEN' });
    const packsRaw = body.packs === undefined || body.packs === null ? 1 : body.packs;
    if (parsePackCount(packsRaw) === null) return sendBulkError(res, { status: 400, message: BULK_LOT_MESSAGES.BULK_PACK_COUNT, code: 'BULK_PACK_COUNT' });
    const expectedAmount = typeof body.expectedAmount === 'number' && Number.isFinite(body.expectedAmount) ? body.expectedAmount : null;

    let normalizedGuestEmail: string | null = null;
    let normalizedGuestName: string | null = null;
    let guestIpHash: string | null = null;
    let guestFpHash: string | null = null;
    if (!req.user) {
      if (!guestEmail || typeof guestEmail !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim())) {
        return res.status(400).json({ message: 'A valid email is required to check out as a guest.' });
      }
      if (!guestName || typeof guestName !== 'string' || !guestName.trim()) {
        return res.status(400).json({ message: 'Your name is required to check out as a guest.' });
      }
      normalizedGuestEmail = guestEmail.trim().toLowerCase();
      normalizedGuestName = guestName.trim().slice(0, 200);
      const clientIp = getClientIp(req);
      guestIpHash = clientIp && clientIp !== 'unknown' ? hashForVelocity(clientIp) : null;
      guestFpHash = deviceFingerprint && typeof deviceFingerprint === 'string' ? hashForVelocity(deviceFingerprint) : null;
      const guestVelocity = await checkGuestCheckoutVelocity({ hashedIp: guestIpHash, hashedDeviceFingerprint: guestFpHash });
      if (guestVelocity.blocked) {
        return res.status(429).json({
          message: "We're temporarily pausing new guest checkouts from this device after a few payment issues in a row. Please wait about 30 minutes and try again, or sign in to your FindA.Sale account to check out without the wait.",
          code: 'GUEST_CHECKOUT_THROTTLED',
        });
      }
    }

    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: {
        sale: {
          select: {
            id: true,
            status: true,
            paymentsHeldAt: true,
            paymentsHeldReason: true,
            zip: true,
            organizerId: true,
            organizer: {
              select: {
                squareMerchantId: true,
                squareOnboarded: true,
                squareLocationId: true,
                userId: true,
                referralDiscountExpiry: true,
                subscriptionTier: true,
              },
            },
          },
        },
      },
    });
    if (!item || !item.sale) return res.status(404).json({ message: 'Item not found' });
    if (item.status !== 'AVAILABLE') return res.status(409).json({ message: `Item is no longer available (status: ${item.status})` });
    const sale = item.sale;

    const eligibility = await assertSaleCanAcceptSquarePayment({
      prisma,
      sale: { id: sale.id, status: sale.status, paymentsHeldAt: sale.paymentsHeldAt },
      organizerSquareMerchantId: sale.organizer.squareMerchantId,
      organizerSquareOnboarded: sale.organizer.squareOnboarded,
    });
    if (eligibility.blocked) return res.status(eligibility.status).json(eligibility.body);

    // A lot is a fixed price item. An auction row can never be a lot, but never sell one as a pack if the data says otherwise.
    if (item.listingType === 'AUCTION' || item.auctionStartPrice) {
      return sendBulkError(res, { status: 409, message: BULK_LOT_MESSAGES.BULK_NOT_PACK, code: 'BULK_NOT_PACK' });
    }

    try {
      if (req.user) {
        await assertCheckoutAllowed({ buyerUserId: req.user.id, saleId: sale.id, itemId: item.id, prisma, context: 'createSquarePayment' });
      } else {
        const hashedFp = deviceFingerprint && typeof deviceFingerprint === 'string' ? crypto.createHash('sha256').update(deviceFingerprint).digest('hex') : null;
        await assertGuestCheckoutAllowed({ hashedDeviceFingerprint: hashedFp, saleId: sale.id, itemId: item.id, prisma, context: 'createSquarePayment-guest' });
      }
    } catch (guardError) {
      if (guardError instanceof CheckoutGuardError) return res.status(403).json({ message: guardError.message });
      throw guardError;
    }

    // The SERVER prices the packs: pack size from the lot, price per 1,000 from the item. expectedAmount is only a check.
    let plan: ReturnType<typeof planPackLine>;
    let fees: ReturnType<typeof computePackFees>;
    let feePercent: number;
    try {
      plan = planPackLine(item, packSize, packsRaw, expectedAmount);
      const baseFeePercent = getInclusivePlatformFeeRate(sale.organizer.subscriptionTier as any, 'ONLINE');
      const discountExpiry = sale.organizer.referralDiscountExpiry;
      feePercent = discountExpiry != null && discountExpiry > new Date() ? 0 : baseFeePercent;
      fees = computePackFees({ cents: plan.cents, feePercent });
      assertPackSellableOnline({
        cents: plan.cents,
        platformFeeCents: fees.platformFeeCents,
        shippingRequested,
        couponCode,
        organizerDiscountAmount: item.organizerDiscountAmount ? parseFloat(item.organizerDiscountAmount.toString()) : 0,
      });
    } catch (planErr) {
      if (isBulkLotError(planErr)) return sendBulkError(res, planErr);
      throw planErr;
    }

    let organizerAccessToken: string;
    try {
      organizerAccessToken = await resolveOrganizerSquareAccessToken({
        id: sale.organizerId,
        squareMerchantId: sale.organizer.squareMerchantId,
        squareOnboarded: sale.organizer.squareOnboarded,
      });
    } catch (err) {
      if (err instanceof SquareOnboardingIncompleteError) {
        return res.status(409).json({
          message: "This seller isn't set up to accept online payments yet. Please contact the organizer to arrange your purchase.",
          code: 'SELLER_PAYMENTS_UNAVAILABLE',
        });
      }
      throw err;
    }

    const buyerKey = packBuyerKey(req.user?.id ?? null, normalizedGuestEmail);
    const txnKey = packClientTransactionId(buyerKey, clientToken);
    const idempotencyKey = buildSquareIdempotencyKey(['sqpack', item.id, buyerKey, clientToken, String(plan.packs), String(plan.cards), String(plan.cents)]);
    const organizerProfileId = sale.organizerId;
    const organizerUserId = sale.organizer.userId;
    const buyerEmail = normalizedGuestEmail ?? req.user?.email ?? null;

    const deps: PackCheckoutDeps = {
      db: prisma as unknown as PackCheckoutDb,
      sell: (tx, id, units) => sellItemUnitsInTransaction(tx, id, units),
      applyDebt: ({ baseAppFeeCents, saleAmountCents }) => applyCashDebtToAppFee({ organizerId: organizerProfileId, baseAppFeeCents, saleAmountCents }),
      releaseDebt: (debtAppliedCents) => releaseCashDebtClaim({ organizerId: organizerProfileId, debtAppliedCents }),
      charge: ({ amountCents, appFeeCents, idempotencyKey: key }) =>
        createSquareCharge({
          organizerAccessToken,
          idempotencyKey: key,
          sourceId,
          amountCents,
          appFeeCents,
          locationId: sale.organizer.squareLocationId,
          referenceId: item.id,
          note: item.title ? item.title.slice(0, 80) : undefined,
          buyerEmailAddress: !req.user && normalizedGuestEmail ? normalizedGuestEmail : undefined,
          verificationToken: typeof verificationToken === 'string' ? verificationToken : undefined,
        }),
      refund: (args) =>
        refundPackPayment({
          ...args,
          organizerProfileId,
          organizerUserId,
          saleId: sale.id,
          itemTitle: item.title,
          shopper: { userId: req.user?.id ?? null, email: buyerEmail, name: normalizedGuestName ?? req.user?.name ?? null },
        }),
      resolveAttribution: () =>
        resolveAffiliateAttribution({ affiliateLinkId, saleId: sale.id, buyerUserId: req.user?.id ?? null, buyerEmail }),
      captureError: (err, extra) => {
        console.error('[bulkLotPackPayment] recording the sale FAILED after the card was charged:', err);
        try {
          Sentry.captureException(err instanceof Error ? err : new Error(String(err)), { tags: { area: 'bulk-pack-online-record' }, level: 'error', extra });
        } catch {
          // Sentry may not be initialized
        }
      },
    };

    const result = await executePackCheckout(deps, {
      itemId: item.id,
      saleId: sale.id,
      txnKey,
      idempotencyKey,
      plan,
      feeBreakdown: fees.feeBreakdown,
      platformFeeCents: fees.platformFeeCents,
      feePercent,
      buyer: { userId: req.user?.id ?? null, email: normalizedGuestEmail, name: normalizedGuestName },
    });

    const packSummary = { packs: plan.packs, packSize: plan.packSize, cards: plan.cards, amountCents: plan.cents };

    switch (result.outcome) {
      case 'REPLAY':
        return res.status(200).json({
          purchaseId: result.purchase.id,
          squarePaymentId: result.purchase.squarePaymentId ?? null,
          status: result.purchase.status ?? 'PAID',
          replay: true,
          ...packSummary,
        });

      case 'DECLINED':
        if (!req.user) await recordGuestCheckoutFailure({ hashedIp: guestIpHash, hashedDeviceFingerprint: guestFpHash });
        return res.status(402).json({ message: result.message, code: 'SQUARE_PAYMENT_DECLINED' });

      case 'DUPLICATE_REFUNDED':
        return res.status(200).json({
          purchaseId: result.purchase.id,
          squarePaymentId: result.purchase.squarePaymentId ?? null,
          status: result.purchase.status ?? 'PAID',
          replay: true,
          duplicateRefunded: result.refund.status === 'REFUNDED',
          code: 'BULK_PACK_DUPLICATE_PAYMENT',
          message: BULK_LOT_MESSAGES.BULK_PACK_DUPLICATE_PAYMENT,
          ...packSummary,
        });

      case 'SOLD_OUT_AFTER_PAYMENT': {
        const refunded = result.refund.status === 'REFUNDED';
        return res.status(409).json({
          charged: true,
          refunded,
          code: 'BULK_SOLD_OUT_AFTER_PAYMENT',
          squarePaymentId: result.paymentId,
          refundCents: result.refund.refundCents,
          message: refunded
            ? `The packs in this bulk lot ran out while your payment was going through. Your card payment of ${formatCents(result.refund.refundCents)} was refunded in full. It can take a few days to show up.`
            : `The packs in this bulk lot ran out while your payment was going through. The shop has been asked to refund ${formatCents(plan.cents)} to your card. If you do not see it in a few days, contact the shop.`,
        });
      }

      case 'RECORD_FAILED': {
        const refunded = result.refund?.status === 'REFUNDED';
        return res.status(500).json({
          charged: true,
          refunded,
          code: 'BULK_RECORD_FAILED',
          squarePaymentId: result.paymentId,
          message: result.refund
            ? refunded
              ? `Your card was charged but the order could not be saved, so ${formatCents(result.refund.refundCents)} was refunded in full. It can take a few days to show up. You can try again.`
              : 'Your card was charged but the order could not be saved. The shop has been asked to refund you. Please do not pay again. If you do not see the refund in a few days, contact the shop.'
            : 'Your card was charged but we could not confirm the order. Please do not pay again. Contact the shop and give them this payment reference.',
        });
      }

      case 'RECORDED':
        break;
    }

    // ---- RECORDED: the cards are taken and the Purchase exists. Everything below is best effort and never fails the sale. ----
    const purchase = result.purchase;
    try {
      await settleCashDebtCollection({ organizerId: organizerProfileId, debtAppliedCents: result.debtAppliedCents });
    } catch (err) {
      console.warn('[bulkLotPackPayment] settleCashDebtCollection failed (non-fatal):', err);
    }
    if (result.attributedAffiliateLinkId) {
      try {
        await recordAffiliateConversion(purchase.id);
      } catch (err) {
        console.warn('[bulkLotPackPayment] affiliate conversion failed (non-fatal):', err);
      }
    }

    if (!result.cardFingerprint) {
      console.warn(JSON.stringify({ level: 'warn', event: 'card_sale_null_fingerprint', source: 'square_bulk_pack_payment', processor: 'SQUARE', squarePaymentId: result.paymentId, purchaseId: purchase.id, itemId: item.id }));
    } else if (req.user) {
      try {
        const dup = await checkPaymentDuplicate(result.cardFingerprint, req.user.id);
        if (dup.isDuplicate) logPaymentDuplicateWarning(req.user.id, result.cardFingerprint, dup.otherUserIds);
        await storePaymentFingerprint(req.user.id, result.cardFingerprint);
      } catch (err) {
        console.warn('[bulkLotPackPayment] dedup/fingerprint-store failed (non-fatal):', err);
      }
    } else {
      try {
        const organizerUser = await prisma.user.findUnique({ where: { id: organizerUserId }, select: { stripeCardFingerprint: true } });
        if (organizerUser?.stripeCardFingerprint && organizerUser.stripeCardFingerprint === result.cardFingerprint) {
          await recordConfirmedSignal(prisma, {
            userId: organizerUserId,
            itemId: item.id,
            saleId: sale.id,
            signalType: 'SHARED_CARD_FP',
            notes: '[bulkLotPackPayment-guest] post-payment card fingerprint matches sale organizer (self-dealing via guest identity).',
          });
        }
      } catch (err) {
        console.warn('[bulkLotPackPayment] guest post-payment collusion check failed (non-fatal):', err);
      }
    }

    // Marketplaces: a lot that sold out is withdrawn everywhere; a lot with cards left gets its listed quantity revised.
    if (result.fullySoldOut) fanOutItemSoldWithdrawals(item.id, 'square_payment');
    else syncMarketplaceStock(item.id, { fullySoldOut: false, remainingStock: result.remainingStock }).catch((err) => console.error('[eBay ReviseQty] sync failed for item', item.id, err));
    reconcileBulkLotEbayInBackgroundIfEnabled(item.id, 'online pack sale');

    // Sale Passport wiring: engagement awards for a logged-in buyer, idempotent per purchase, never throws.
    if (req.user) fireSquarePurchaseEngagement(purchase.id);

    setImmediate(() => {
      generateReceipt(purchase.id).catch((err) => console.error('[bulkLotPackPayment] Failed to generate receipt:', err));
    });

    const what = `${plan.packs} ${plan.packs === 1 ? 'pack' : 'packs'} of ${item.title}`;
    if (organizerUserId) {
      createNotification({
        userId: organizerUserId,
        type: 'payment_received',
        title: 'Payment received',
        body: `Payment of ${formatCents(plan.cents)} received for ${what}`,
        link: `/organizer/sales/${sale.id}`,
        channel: 'OPERATIONAL',
        sendEmail: true,
      }).catch((err) => console.error('[bulkLotPackPayment] Failed to notify organizer:', err));
    }
    if (req.user) {
      createNotification({
        userId: req.user.id,
        type: 'purchase',
        title: 'Purchase confirmed',
        body: `Your purchase of ${what} is confirmed. Pick it up from the shop.`,
        link: `/purchases/${purchase.id}`,
        channel: 'OPERATIONAL',
      }).catch((err) => console.error('[bulkLotPackPayment] Failed to notify buyer:', err));
    }

    return res.status(200).json({ purchaseId: purchase.id, squarePaymentId: result.paymentId, status: purchase.status ?? 'PAID', ...packSummary });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[bulkLotPackPayment] Error creating pack payment:', msg);
    return res.status(500).json({ message: 'Failed to process payment' });
  }
}

/**
 * Full refund of one captured pack payment, with the messages that fit the reason. Never throws.
 * The refund itself is the shared oversold settlement (same Square refund service, kill switch and a deterministic idempotency key
 * per payment id, so asking twice is one refund).
 */
async function refundPackPayment(args: {
  paymentId: string;
  amountCents: number;
  reason: 'SOLD_OUT' | 'DUPLICATE' | 'RECORD_FAILED';
  organizerProfileId: string;
  organizerUserId: string | null | undefined;
  saleId: string;
  itemTitle: string;
  shopper: { userId: string | null; email: string | null; name: string | null };
}): Promise<PackRefundResult> {
  try {
    const settlement = computeOversoldSettlement({ cardCents: args.amountCents, cashCents: 0, weightsCents: [args.amountCents], oversoldIdx: [0] });
    const settled = await settleOversoldPayment({
      kind: 'online-pack',
      refId: args.paymentId,
      organizerProfileId: args.organizerProfileId,
      processor: 'SQUARE',
      paymentId: args.paymentId,
      cardPaidCents: args.amountCents,
      settlement,
    });
    if (args.reason === 'SOLD_OUT') {
      await notifyOversoldSettlement({
        result: settled,
        settlement,
        titles: [args.itemTitle],
        processor: 'SQUARE',
        ref: args.paymentId,
        partiallyFulfilled: false,
        organizerUserId: args.organizerUserId,
        organizerLink: `/organizer/sales/${args.saleId}`,
        shopper: { userId: args.shopper.userId, email: args.shopper.email, name: args.shopper.name, link: null },
      });
    } else {
      await notifyPackRefund(args, settled.status, settled.refundCents);
    }
    return { status: settled.status, refundCents: settled.refundCents };
  } catch (err) {
    console.error('[bulkLotPackPayment] refund of a pack payment threw (manual refund needed):', err);
    try {
      Sentry.captureException(err instanceof Error ? err : new Error(String(err)), { tags: { area: 'bulk-pack-online-refund', reason: args.reason }, level: 'error', extra: { squarePaymentId: args.paymentId } });
    } catch {
      // Sentry may not be initialized
    }
    return { status: 'MANUAL', refundCents: args.amountCents };
  }
}

/** Short notices for the two refund reasons the shared oversold copy does not fit (duplicate payment, order not saved). */
async function notifyPackRefund(
  args: { paymentId: string; reason: 'SOLD_OUT' | 'DUPLICATE' | 'RECORD_FAILED'; organizerUserId: string | null | undefined; saleId: string; itemTitle: string; shopper: { userId: string | null } },
  status: 'REFUNDED' | 'MANUAL' | 'NOTHING_TO_REFUND',
  refundCents: number
): Promise<void> {
  const money = formatCents(refundCents);
  const why = args.reason === 'DUPLICATE' ? 'a second payment for the same order' : 'an order that could not be saved';
  try {
    if (args.shopper.userId) {
      await createNotification({
        userId: args.shopper.userId,
        type: 'payment_refunded',
        title: status === 'REFUNDED' ? 'Payment refunded' : 'Refund on the way',
        body:
          status === 'REFUNDED'
            ? `${money} was refunded to your card for ${why}. It can take a few days to show up.`
            : `${money} is being refunded for ${why}. If you do not see it in a few days, contact the shop.`,
        link: null,
        channel: 'OPERATIONAL',
      } as any);
    }
    if (status !== 'REFUNDED' && args.organizerUserId) {
      await createNotification({
        userId: args.organizerUserId,
        type: 'payment_reconciliation',
        title: 'Payment needs a refund',
        body: `A shopper paid for "${args.itemTitle}" but ${why} needs ${money} refunded and the automatic refund did not go through. Please refund it from your Square dashboard. Ref ${args.paymentId}.`,
        link: `/organizer/sales/${args.saleId}`,
        channel: 'OPERATIONAL',
      });
    }
  } catch (err) {
    console.warn('[bulkLotPackPayment] refund notification failed (non-fatal):', err);
  }
}
