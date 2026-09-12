import { Response } from 'express';
import crypto from 'crypto';
import * as Sentry from '@sentry/node';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { createNotification } from '../lib/notificationService';
import { generateReceipt } from '../services/receiptService';
import { checkPaymentDuplicate, storePaymentFingerprint, logPaymentDuplicateWarning } from '../services/paymentDeduplicationService'; // Platform Safety #102
import {
  calculateApplicationFee,
  getPlatformFeeRate,
  snapshotForCommissionOnly,
  snapshotFromBreakdown,
  SubscriptionTier,
} from '../utils/feeCalculator';
import { sellItemUnits, InsufficientStockError } from '../services/itemStockService';
import { assertCheckoutAllowed, assertGuestCheckoutAllowed, recordConfirmedSignal, CheckoutGuardError } from '../services/checkoutGuard'; // S1072 Finding #4: collusion/wash-trade guard
import { assertSaleCanAcceptSquarePayment } from '../services/squarePaymentEligibilityService';
import { checkGuestCheckoutVelocity, recordGuestCheckoutFailure, hashForVelocity } from '../services/guestCheckoutVelocityGuard'; // 2026-09-06 carding incident guard, ported as-is per fraud-hardening build tenet
import { getClientIp } from '../utils/getClientIp';
import { repriceNativeShippingForDestination, ShippingHardBlockError } from '../services/nativeShippingSuggestionService'; // ADR-110 Track 1
import {
  resolveOrganizerSquareAccessToken,
  SquareOnboardingIncompleteError,
  buildSquareIdempotencyKey,
  createSquareCharge,
} from '../services/squarePaymentService';
import { applyCashDebtToAppFee, settleCashDebtCollection } from '../services/cashFeeService'; // Stripe-removal cash-fee-debt recoupment (2026-09-12)

/**
 * Square Checkout -- Wave 1 #1 (2026-09-07). Mirrors stripeController.ts's
 * createPaymentIntent (single item) and createCartCheckoutSession (cart), Square-flavored.
 *
 * BIGGEST STRUCTURAL DIFFERENCE FROM THE STRIPE VERSION: Square's CreatePayment is
 * SYNCHRONOUS -- there is no PaymentIntent-then-webhook-confirms two-step and no hosted
 * Checkout Session redirect. A successful call here means the charge is DONE (status
 * COMPLETED/APPROVED) in the same request/response cycle, so every "webhook does this"
 * comment in the Stripe file becomes "this function does it inline, right here" in this
 * one. Declines are also synchronous -- caught inline, never via a separate failure event.
 *
 * SCOPE NOTE (deliberate, see dispatch handoff for the full list): this is the CORE
 * money-correct + fraud-hardened path -- guards, fee math (incl. auction buyer premium,
 * organizer discount, coupon, shipping repricing), the Square charge itself, Purchase
 * creation with the fee snapshot, stock decrement, item status, a receipt row, and
 * buyer+organizer notifications. NOT ported (see handoff): loyalty stamps/badges/XP,
 * live-feed socket pushes, Zapier webhooks, consignor-sold email, eBay/Shopify/FB
 * cross-listing sold-sync. None of those affect payment correctness or fraud posture --
 * they're engagement/distribution side effects Stripe's webhook handler also performs,
 * intentionally deferred to keep this dispatch inside its effort budget.
 */

const buildPurchaseFeeContext = (params: {
  isAuctionItem: boolean;
  priceCents: number;
  feePercent: number;
  saleCoversFee: boolean;
}) => {
  const feeBreakdown = calculateApplicationFee(params.priceCents, params.feePercent, params.isAuctionItem);
  const buyerPremiumAmount = feeBreakdown.buyerPremiumCents;
  const totalWithBuyerPremium = params.priceCents + buyerPremiumAmount;
  const platformFeeAmount = feeBreakdown.applicationFeeCents;
  return { feeBreakdown, buyerPremiumAmount, totalWithBuyerPremium, platformFeeAmount };
};

export const createSquarePayment = async (req: AuthRequest, res: Response) => {
  try {
    const {
      itemId,
      sourceId,
      affiliateLinkId,
      shippingRequested,
      couponCode,
      guestEmail,
      guestName,
      deviceFingerprint,
      clientToken,
      shippingZip,
      shippingAddressLine1,
      shippingAddressLine2,
      shippingCity,
      shippingState,
      verificationToken,
    } = req.body;

    if (!itemId) {
      return res.status(400).json({ message: 'Item ID is required' });
    }
    if (!sourceId || typeof sourceId !== 'string' || !sourceId.trim()) {
      return res.status(400).json({ message: 'A tokenized payment source is required.' });
    }

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

      // 2026-09-06 carding incident guard, ported as-is (fraud-hardening build tenet) --
      // see guestCheckoutVelocityGuard.ts for the full design writeup.
      const clientIp = getClientIp(req);
      guestIpHash = clientIp && clientIp !== 'unknown' ? hashForVelocity(clientIp) : null;
      guestFpHash = deviceFingerprint && typeof deviceFingerprint === 'string'
        ? hashForVelocity(deviceFingerprint)
        : null;
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
            coversFee: true,
            organizer: {
              select: {
                squareMerchantId: true,
                squareOnboarded: true,
                squareLocationId: true,
                userId: true,
                referralDiscountExpiry: true,
                subscriptionTier: true,
                lat: true,
                lng: true,
              },
            },
          },
        },
      },
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    if (item.status !== 'AVAILABLE') {
      return res.status(409).json({ message: `Item is no longer available (status: ${item.status})` });
    }

    const eligibility = await assertSaleCanAcceptSquarePayment({
      prisma,
      sale: { id: item.sale!.id, status: item.sale!.status, paymentsHeldAt: item.sale!.paymentsHeldAt },
      organizerSquareMerchantId: item.sale!.organizer.squareMerchantId,
      organizerSquareOnboarded: item.sale!.organizer.squareOnboarded,
    });
    if (eligibility.blocked) {
      return res.status(eligibility.status).json(eligibility.body);
    }

    // VALID-STATE-ONLY-EXPOSURE (Security-QA Gate) -- parity with stripeController.ts's
    // createPaymentIntent: an open auction lot must not be buyable outright here.
    if (item.listingType === 'AUCTION' && !item.auctionClosed) {
      return res.status(403).json({
        message: 'This is an auction lot. Place a bid to compete for it -- it cannot be bought outright while bidding is open.',
      });
    }

    try {
      if (req.user) {
        await assertCheckoutAllowed({
          buyerUserId: req.user.id,
          saleId: item.sale!.id,
          itemId: item.id,
          prisma,
          context: 'createSquarePayment',
        });
      } else {
        const hashedFp = deviceFingerprint && typeof deviceFingerprint === 'string'
          ? crypto.createHash('sha256').update(deviceFingerprint).digest('hex')
          : null;
        await assertGuestCheckoutAllowed({
          hashedDeviceFingerprint: hashedFp,
          saleId: item.sale!.id,
          itemId: item.id,
          prisma,
          context: 'createSquarePayment-guest',
        });
      }
    } catch (guardError) {
      if (guardError instanceof CheckoutGuardError) {
        return res.status(403).json({ message: guardError.message });
      }
      throw guardError;
    }

    const isAuctionItem = item.listingType === 'AUCTION' || !!item.auctionStartPrice;
    let price: number;
    if (isAuctionItem) {
      price = item.currentBid ?? item.auctionStartPrice ?? 0;
    } else {
      price = item.price ?? 0;
    }
    if (isNaN(price) || price <= 0) {
      return res.status(400).json({ message: 'Invalid price value' });
    }
    if (price < 0.5) {
      return res.status(400).json({ message: 'Item price must be at least $0.50 to process payment' });
    }

    // ADR-110 Track 1: server-computed shipping only -- same posture as the Stripe path.
    let shippingCost = 0;
    let shippingTier: string | null = null;
    const shippingApplicable = !!shippingRequested && !isAuctionItem && item.shippingAvailable && item.shippingPrice != null;
    if (shippingApplicable) {
      const zipCandidate = typeof shippingZip === 'string' ? shippingZip.trim() : '';
      if (!/^\d{5}(-\d{4})?$/.test(zipCandidate)) {
        return res.status(400).json({ message: 'Enter your shipping ZIP code to see the shipping total.' });
      }
      if (item.packageWeightOz == null) {
        shippingCost = item.shippingPrice!;
      } else {
        try {
          const reprice = await repriceNativeShippingForDestination(
            {
              weightOz: item.packageWeightOz,
              dims: {
                length: item.packageLengthIn != null ? Number(item.packageLengthIn) : null,
                width: item.packageWidthIn != null ? Number(item.packageWidthIn) : null,
                height: item.packageHeightIn != null ? Number(item.packageHeightIn) : null,
              },
              packageType: item.packageType ?? null,
              origin: { zip: item.sale!.zip, lat: item.sale!.organizer.lat, lng: item.sale!.organizer.lng },
              subscriptionTier: item.sale!.organizer.subscriptionTier as any,
              categoryId: item.ebayCategoryId ?? null,
              priceUsd: item.price ?? null,
            },
            zipCandidate
          );
          shippingCost = reprice.shippingCost;
          shippingTier = reprice.tier;
        } catch (repriceErr) {
          if (repriceErr instanceof ShippingHardBlockError) {
            shippingCost = item.shippingPrice!;
            shippingTier = null;
          } else {
            throw repriceErr;
          }
        }
      }
    }

    const baseFeePercent = getPlatformFeeRate(item.sale!.organizer.subscriptionTier as any);
    const discountExpiry = item.sale!.organizer.referralDiscountExpiry;
    const hasReferralDiscount = discountExpiry != null && discountExpiry > new Date();
    const feePercent = hasReferralDiscount ? 0 : baseFeePercent;

    const priceCents = Math.round((price + shippingCost) * 100);
    const { feeBreakdown, totalWithBuyerPremium, platformFeeAmount } = buildPurchaseFeeContext({
      isAuctionItem,
      priceCents,
      feePercent,
      saleCoversFee: !isAuctionItem ? false : (item.sale as any)?.coversFee === true,
    });
    const saleCoversFee = !isAuctionItem ? false : (item.sale as any)?.coversFee === true;

    let organizerDiscountActive = false;
    let discountAmount = 0;
    let couponId: string | undefined;

    if (item.organizerDiscountAmount && parseFloat(item.organizerDiscountAmount.toString()) > 0) {
      organizerDiscountActive = true;
      discountAmount = Math.round(parseFloat(item.organizerDiscountAmount.toString()) * 100);
      discountAmount = Math.min(discountAmount, priceCents - 50);
    } else if (couponCode && !req.user) {
      return res.status(400).json({ message: 'Coupon codes require a FindA.Sale account. Sign in to use a coupon, or continue as a guest without one.' });
    } else if (couponCode) {
      const coupon = await prisma.coupon.findUnique({ where: { code: (couponCode as string).trim().toUpperCase() } });
      if (!coupon || coupon.userId !== req.user!.id || coupon.status !== 'ACTIVE' || coupon.expiresAt < new Date()) {
        return res.status(400).json({ message: 'Invalid or expired coupon code' });
      }
      if (coupon.discountType === 'FIXED') {
        discountAmount = Math.min(Math.round(coupon.discountValue * 100), priceCents - 50);
      } else {
        const pct = Math.round(priceCents * (coupon.discountValue / 100));
        const raw = coupon.maxDiscountAmount ? Math.min(pct, Math.round(coupon.maxDiscountAmount * 100)) : pct;
        discountAmount = Math.min(raw, priceCents - 50);
      }
      couponId = coupon.id;
    }

    const finalPriceCents = isAuctionItem && saleCoversFee
      ? priceCents - discountAmount
      : totalWithBuyerPremium - discountAmount;

    let organizerAccessToken: string;
    try {
      organizerAccessToken = await resolveOrganizerSquareAccessToken({
        id: item.sale!.organizerId,
        squareMerchantId: item.sale!.organizer.squareMerchantId,
        squareOnboarded: item.sale!.organizer.squareOnboarded,
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

    // Idempotency-key length note (Square caps at 45 chars, see squarePaymentService.ts):
    // hashed, not a literal cuid concatenation.
    const guestIdempotencySuffix = clientToken && typeof clientToken === 'string' && clientToken.trim()
      ? clientToken.trim().slice(0, 100)
      : crypto.randomUUID();
    const idempotencyKey = buildSquareIdempotencyKey([
      'sqpay',
      itemId,
      req.user ? req.user.id : `guest-${guestIdempotencySuffix}`,
      couponId,
    ]);

    // Cash-fee-debt recoupment (2026-09-12): pad this card sale's appFeeMoney with whatever
    // room exists to collect outstanding Organizer.cashFeeBalance -- see cashFeeService.ts.
    const { appFeeCents, debtAppliedCents } = await applyCashDebtToAppFee({
      organizerId: item.sale!.organizerId,
      baseAppFeeCents: platformFeeAmount,
      saleAmountCents: finalPriceCents,
    });

    const chargeResult = await createSquareCharge({
      organizerAccessToken,
      idempotencyKey,
      sourceId,
      amountCents: finalPriceCents,
      appFeeCents,
      locationId: item.sale!.organizer.squareLocationId,
      referenceId: item.id,
      note: item.title ? item.title.slice(0, 80) : undefined,
      buyerEmailAddress: !req.user && normalizedGuestEmail ? normalizedGuestEmail : undefined,
      verificationToken: typeof verificationToken === 'string' ? verificationToken : undefined,
    });

    if (!chargeResult.ok) {
      if (!req.user) {
        await recordGuestCheckoutFailure({ hashedIp: guestIpHash, hashedDeviceFingerprint: guestFpHash });
      }
      return res.status(402).json({ message: chargeResult.message, code: 'SQUARE_PAYMENT_DECLINED' });
    }

    // Idempotent-retry-safe lookup, same shape as the Stripe path's findFirst-before-create.
    let purchase = await prisma.purchase.findFirst({
      where: { squarePaymentId: chargeResult.paymentId, itemId: item.id },
    });

    if (!purchase) {
      purchase = await prisma.purchase.create({
        data: {
          userId: req.user?.id ?? null,
          itemId: item.id,
          saleId: item.sale!.id,
          amount: finalPriceCents / 100,
          platformFeeAmount: appFeeCents / 100,
          cashDebtCollectedAmount: debtAppliedCents > 0 ? debtAppliedCents / 100 : undefined,
          ...snapshotFromBreakdown(feeBreakdown, feePercent, saleCoversFee),
          processor: 'SQUARE',
          squarePaymentId: chargeResult.paymentId,
          status: 'PAID',
          source: 'ONLINE',
          buyerEmail: normalizedGuestEmail ?? undefined,
          guestName: normalizedGuestName ?? undefined,
          // NOTE: field is named stripeCardFingerprint/buyerCardFingerprint in schema for
          // historical (Stripe-only-at-the-time) reasons -- it stores ANY processor's card
          // fingerprint. Not renamed here (schema is locked for this dispatch).
          buyerCardFingerprint: chargeResult.cardFingerprint ?? undefined,
          deliveryMethod: shippingApplicable ? 'SHIP' : 'LOCAL_PICKUP',
          affiliateLinkId: affiliateLinkId ?? undefined,
          ...(shippingApplicable
            ? {
                shippingZip: typeof shippingZip === 'string' ? shippingZip.trim() : '',
                shippingCountry: 'US',
                ...(typeof shippingAddressLine1 === 'string' && shippingAddressLine1.trim()
                  ? { shippingAddressLine1: shippingAddressLine1.trim().slice(0, 200) }
                  : {}),
                ...(typeof shippingAddressLine2 === 'string' && shippingAddressLine2.trim()
                  ? { shippingAddressLine2: shippingAddressLine2.trim().slice(0, 200) }
                  : {}),
                ...(typeof shippingCity === 'string' && shippingCity.trim()
                  ? { shippingCity: shippingCity.trim().slice(0, 100) }
                  : {}),
                ...(typeof shippingState === 'string' && shippingState.trim()
                  ? { shippingState: shippingState.trim().slice(0, 50) }
                  : {}),
                ...(shippingTier ? { shippingFedexSurchargeTier: shippingTier } : {}),
              }
            : {}),
        },
      });

      // Only settle on the branch that actually just created the row -- the findFirst-hit
      // (idempotent retry) branch above must never decrement cashFeeBalance a second time for
      // the same real charge.
      await settleCashDebtCollection({ organizerId: item.sale!.organizerId, debtAppliedCents });
    }

    // Platform Safety #102 (auth) / post-payment guest self-dealing check (S1072 Finding #4
    // shape) -- Square returns the card fingerprint SYNCHRONOUSLY, so this runs inline here
    // instead of in a webhook the way the Stripe path's guest half does.
    if (chargeResult.cardFingerprint) {
      if (req.user) {
        try {
          const dup = await checkPaymentDuplicate(chargeResult.cardFingerprint, req.user.id);
          if (dup.isDuplicate) {
            logPaymentDuplicateWarning(req.user.id, chargeResult.cardFingerprint, dup.otherUserIds);
          }
          await storePaymentFingerprint(req.user.id, chargeResult.cardFingerprint);
        } catch (err) {
          console.warn('[squarePayment] dedup/fingerprint-store failed (non-fatal):', err);
        }
      } else {
        try {
          const organizerUser = await prisma.user.findUnique({
            where: { id: item.sale!.organizer.userId },
            select: { stripeCardFingerprint: true },
          });
          if (organizerUser?.stripeCardFingerprint && organizerUser.stripeCardFingerprint === chargeResult.cardFingerprint) {
            await recordConfirmedSignal(prisma, {
              userId: item.sale!.organizer.userId,
              itemId: item.id,
              saleId: item.sale!.id,
              signalType: 'SHARED_CARD_FP',
              notes: '[createSquarePayment-guest] post-payment card fingerprint matches sale organizer (self-dealing via guest identity).',
            });
          }
        } catch (err) {
          console.warn('[squarePayment] guest post-payment collusion check failed (non-fatal):', err);
        }
      }
    }

    let soldOut = false;
    try {
      ({ fullySoldOut: soldOut } = await sellItemUnits(item.id, 1));
    } catch (stockErr: any) {
      if (stockErr instanceof InsufficientStockError) {
        // Race: Square already captured the charge (synchronous, no PENDING window the
        // way Stripe's async flow has) but the item sold out to someone else in the tiny
        // window between the eligibility check above and this decrement. squareRefundService.ts
        // (Wave 1 #4) does not exist yet, so this cannot be auto-refunded here -- mark the
        // row REFUNDING (existing enum value, closest honest fit: "captured, needs refund
        // handling") and alert loudly rather than silently leaving it PAID with no item.
        console.error(`[squarePayment] Stock race on item ${item.id}: Square payment ${chargeResult.paymentId} captured but item already sold out -- needs manual/automated refund.`);
        try {
          Sentry.captureMessage(
            `[squarePayment] Square stock-race needs refund: paymentId=${chargeResult.paymentId} itemId=${item.id} purchaseId=${purchase.id}`,
            'error'
          );
        } catch {
          // Sentry may not be initialized
        }
        await prisma.purchase.update({ where: { id: purchase.id }, data: { status: 'REFUNDING' } }).catch(() => {});
      } else {
        throw stockErr;
      }
    }

    setImmediate(() => {
      generateReceipt(purchase!.id).catch((err) => console.error('[squarePayment] Failed to generate receipt:', err));
    });

    const organizerUserId = item.sale!.organizer.userId;
    if (organizerUserId) {
      createNotification({
        userId: organizerUserId,
        type: 'payment_received',
        title: 'Payment received',
        body: `Payment of $${(finalPriceCents / 100).toFixed(2)} received for "${item.title}"`,
        link: `/organizer/sales/${item.sale!.id}`,
        channel: 'OPERATIONAL',
        sendEmail: true,
      }).catch((err) => console.error('[squarePayment] Failed to notify organizer:', err));
    }
    if (req.user) {
      createNotification({
        userId: req.user.id,
        type: 'purchase',
        title: 'Purchase confirmed',
        body: `Your purchase of "${item.title}" is confirmed!`,
        // Stripe dead-link fix (2026-09-09, findasale-dev BUG MODE): /shopper/purchases is not
        // a real route (404s); purchase.id is already in scope (single-item payment).
        link: `/purchases/${purchase.id}`,
        channel: 'OPERATIONAL',
      }).catch((err) => console.error('[squarePayment] Failed to notify buyer:', err));
    }

    return res.status(200).json({ purchaseId: purchase.id, squarePaymentId: chargeResult.paymentId, status: soldOut === false ? purchase.status : 'PAID' });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[squarePayment] Error creating Square payment:', msg);
    return res.status(500).json({ message: 'Failed to process payment' });
  }
};

export const createSquareCartPayment = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { itemIds, sourceId, verificationToken } = req.body as { itemIds?: string[]; sourceId?: string; verificationToken?: string };
    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ error: 'itemIds must be a non-empty array' });
    }
    if (itemIds.length > 50) {
      return res.status(400).json({ error: 'Cart cannot exceed 50 items' });
    }
    if (!sourceId || typeof sourceId !== 'string' || !sourceId.trim()) {
      return res.status(400).json({ error: 'A tokenized payment source is required.' });
    }

    const items = await prisma.item.findMany({
      where: { id: { in: itemIds } },
      select: {
        id: true,
        title: true,
        price: true,
        status: true,
        saleId: true,
        listingType: true,
        auctionStartPrice: true,
        sale: {
          select: {
            id: true,
            status: true,
            paymentsHeldAt: true,
            paymentsHeldReason: true,
            organizerId: true,
            organizer: {
              select: {
                squareMerchantId: true,
                squareOnboarded: true,
                squareLocationId: true,
                subscriptionTier: true,
                userId: true,
              },
            },
          },
        },
      },
    });

    if (items.length !== itemIds.length) {
      const foundIds = new Set(items.map((i) => i.id));
      const missing = itemIds.filter((id) => !foundIds.has(id));
      return res.status(404).json({ error: `Items not found: ${missing.join(', ')}` });
    }

    // Security fix (findasale-hacker adversarial pass, 2026-09-10): the prior
    // `.filter(Boolean)` silently DROPPED any item with a null saleId before computing the
    // "all items share one sale" set. Item.saleId is genuinely nullable in production
    // (schema.prisma ~line 1304/1340 -- Feature #300 unlisted "library" inventory items,
    // status defaults AVAILABLE, denormalized organizerId). An item with saleId=null could
    // ride along in the same cart request as one legitimate item from an unrelated
    // sale/organizer: it would still be priced into totalCents, charged via THAT organizer's
    // Square account, stock-decremented via sellItemUnits, and given a Purchase row stamped
    // with a saleId it never belonged to -- a real cross-tenant charge/misattribution, not
    // merely a validation gap. Fix: every item must have a NON-NULL saleId, and all of them
    // must be the SAME saleId -- no more filtering nulls out of the uniqueness check.
    const itemsWithoutSale = items.filter((i) => !i.saleId);
    if (itemsWithoutSale.length > 0) {
      return res.status(400).json({ error: `Some items are not part of an active sale: ${itemsWithoutSale.map((i) => i.title).join(', ')}` });
    }
    const saleIds = [...new Set(items.map((i) => i.saleId))];
    if (saleIds.length !== 1) {
      return res.status(400).json({ error: 'All cart items must belong to the same sale' });
    }
    const saleId = saleIds[0]!;
    const organizer = items[0].sale?.organizer;

    try {
      await assertCheckoutAllowed({
        buyerUserId: req.user.id,
        saleId,
        itemId: items[0].id,
        prisma,
        context: 'createSquareCartPayment',
      });
    } catch (guardError) {
      if (guardError instanceof CheckoutGuardError) {
        return res.status(403).json({ error: guardError.message });
      }
      throw guardError;
    }

    const cartEligibility = await assertSaleCanAcceptSquarePayment({
      prisma,
      sale: { id: saleId, status: items[0].sale!.status, paymentsHeldAt: items[0].sale!.paymentsHeldAt },
      organizerSquareMerchantId: organizer?.squareMerchantId,
      organizerSquareOnboarded: organizer?.squareOnboarded,
    });
    if (cartEligibility.blocked) {
      return res.status(cartEligibility.status).json(cartEligibility.body);
    }

    // AUCTION EXCLUSION GUARD -- new here, a real pre-existing gap in Stripe's
    // createCartCheckoutSession (confirmed by direct read: that function never checks
    // listingType/auctionStartPrice at all). Not carried forward into this new Square path.
    const auctionItems = items.filter((i) => i.listingType === 'AUCTION' || i.auctionStartPrice != null);
    if (auctionItems.length > 0) {
      return res.status(400).json({
        error: `Auction lots can't be added to a cart checkout -- place a bid instead: ${auctionItems.map((i) => i.title).join(', ')}`,
        code: 'AUCTION_ITEM_IN_CART',
      });
    }

    const unavailable = items.filter((i) => i.status !== 'AVAILABLE');
    if (unavailable.length > 0) {
      return res.status(409).json({ error: `Some items are no longer available: ${unavailable.map((i) => i.title).join(', ')}` });
    }

    const noPriceItems = items.filter((i) => i.price == null || i.price <= 0);
    if (noPriceItems.length > 0) {
      return res.status(400).json({ error: `Some items have no price set: ${noPriceItems.map((i) => i.title).join(', ')}` });
    }

    const tier = (organizer?.subscriptionTier ?? null) as SubscriptionTier;
    const feeRate = getPlatformFeeRate(tier);
    const totalCents = items.reduce((sum, i) => sum + Math.round((i.price as number) * 100), 0);
    const platformFeeAmount = Math.round(totalCents * feeRate);

    let organizerAccessToken: string;
    try {
      organizerAccessToken = await resolveOrganizerSquareAccessToken({
        id: items[0].sale!.organizerId,
        squareMerchantId: organizer?.squareMerchantId ?? null,
        squareOnboarded: organizer?.squareOnboarded ?? false,
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

    const idempotencyKey = buildSquareIdempotencyKey([
      'sqcart',
      saleId,
      req.user.id,
      itemIds.slice().sort().join(','),
    ]);

    // Cash-fee-debt recoupment (2026-09-12): pad this cart's single charge's appFeeMoney with
    // whatever room exists to collect outstanding Organizer.cashFeeBalance -- see cashFeeService.ts.
    const { appFeeCents, debtAppliedCents } = await applyCashDebtToAppFee({
      organizerId: items[0].sale!.organizerId,
      baseAppFeeCents: platformFeeAmount,
      saleAmountCents: totalCents,
    });

    const chargeResult = await createSquareCharge({
      organizerAccessToken,
      idempotencyKey,
      sourceId,
      amountCents: totalCents,
      appFeeCents,
      locationId: organizer?.squareLocationId,
      referenceId: saleId,
      note: `Cart checkout -- ${items.length} item(s)`,
      verificationToken: typeof verificationToken === 'string' ? verificationToken : undefined,
    });

    if (!chargeResult.ok) {
      return res.status(402).json({ error: chargeResult.message, code: 'SQUARE_PAYMENT_DECLINED' });
    }

    // All N Purchase rows share this one squarePaymentId -- genuinely new shape vs. the
    // Stripe cart path's hosted-Checkout-Session clone (per dispatch scope: do not port
    // that shape). Purchase.squarePaymentId is unique only in combination with itemId
    // (Wave 0 migration), same multi-item-cart reasoning as stripePaymentIntentId.
    const createdPurchaseIds: string[] = [];
    let anyStockRace = false;
    let anyNewPurchaseCreated = false;
    let remainingDebtCentsToAllocate = debtAppliedCents;
    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      const item = items[itemIndex];
      const itemPriceCents = Math.round((item.price as number) * 100);
      const itemFeeCents = Math.round(itemPriceCents * feeRate);
      // Allocate the cart's single debt-recoupment amount across per-item Purchase rows
      // proportionally to price share, so a later refund of ONE item can reverse exactly its
      // own share (see squareRefundService.ts) -- the last item absorbs any rounding remainder
      // so the per-item shares always sum to exactly debtAppliedCents.
      const isLastItem = itemIndex === items.length - 1;
      const itemDebtCents = isLastItem
        ? remainingDebtCentsToAllocate
        : Math.min(remainingDebtCentsToAllocate, Math.round(debtAppliedCents * (itemPriceCents / totalCents)));
      remainingDebtCentsToAllocate -= itemDebtCents;

      let purchase = await prisma.purchase.findFirst({
        where: { squarePaymentId: chargeResult.paymentId, itemId: item.id },
      });
      if (!purchase) {
        purchase = await prisma.purchase.create({
          data: {
            userId: req.user.id,
            itemId: item.id,
            saleId,
            amount: item.price as number,
            platformFeeAmount: (itemFeeCents + itemDebtCents) / 100,
            cashDebtCollectedAmount: itemDebtCents > 0 ? itemDebtCents / 100 : undefined,
            ...snapshotForCommissionOnly(itemFeeCents / 100, feeRate),
            processor: 'SQUARE',
            squarePaymentId: chargeResult.paymentId,
            status: 'PAID',
            source: 'ONLINE',
            deliveryMethod: 'LOCAL_PICKUP',
            buyerCardFingerprint: chargeResult.cardFingerprint ?? undefined,
          },
        });
        anyNewPurchaseCreated = true;
      }
      createdPurchaseIds.push(purchase.id);

      try {
        await sellItemUnits(item.id, 1);
      } catch (stockErr: any) {
        if (stockErr instanceof InsufficientStockError) {
          anyStockRace = true;
          console.error(`[squareCartPayment] Stock race on item ${item.id}: Square payment ${chargeResult.paymentId} captured but item already sold out -- needs manual/automated refund.`);
          try {
            Sentry.captureMessage(
              `[squareCartPayment] Square stock-race needs refund: paymentId=${chargeResult.paymentId} itemId=${item.id} purchaseId=${purchase.id}`,
              'error'
            );
          } catch {
            // Sentry may not be initialized
          }
          await prisma.purchase.update({ where: { id: purchase.id }, data: { status: 'REFUNDING' } }).catch(() => {});
        } else {
          throw stockErr;
        }
      }

      setImmediate(() => {
        generateReceipt(purchase!.id).catch((err) => console.error('[squareCartPayment] Failed to generate receipt:', err));
      });
    }

    // Only settle on the call that actually just created new rows -- an idempotent retry where
    // every item already had a Purchase row must never decrement cashFeeBalance a second time.
    if (anyNewPurchaseCreated) {
      await settleCashDebtCollection({ organizerId: items[0].sale!.organizerId, debtAppliedCents });
    }

    if (chargeResult.cardFingerprint) {
      try {
        const dup = await checkPaymentDuplicate(chargeResult.cardFingerprint, req.user.id);
        if (dup.isDuplicate) {
          logPaymentDuplicateWarning(req.user.id, chargeResult.cardFingerprint, dup.otherUserIds);
        }
        await storePaymentFingerprint(req.user.id, chargeResult.cardFingerprint);
      } catch (err) {
        console.warn('[squareCartPayment] dedup/fingerprint-store failed (non-fatal):', err);
      }
    }

    const organizerUserId = organizer?.userId;
    if (organizerUserId) {
      createNotification({
        userId: organizerUserId,
        type: 'payment_received',
        title: 'Payment received',
        body: `Payment of $${(totalCents / 100).toFixed(2)} received for ${items.length} item(s)`,
        link: `/organizer/sales/${saleId}`,
        channel: 'OPERATIONAL',
        sendEmail: true,
      }).catch((err) => console.error('[squareCartPayment] Failed to notify organizer:', err));
    }
    createNotification({
      userId: req.user.id,
      type: 'purchase',
      title: 'Purchase confirmed',
      body: `Your purchase of ${items.length} item(s) is confirmed!`,
      // Stripe dead-link fix (2026-09-09, findasale-dev BUG MODE): /shopper/purchases is not a
      // real route (404s). This is a multi-item cart checkout (createdPurchaseIds can hold
      // several Purchase rows across different items) -- link straight to the single purchase
      // detail page only when there is exactly one, otherwise fall back to the real shopper
      // purchase-history list page rather than picking one purchase id arbitrarily.
      link: createdPurchaseIds.length === 1 ? `/purchases/${createdPurchaseIds[0]}` : '/shopper/dashboard',
      channel: 'OPERATIONAL',
    }).catch((err) => console.error('[squareCartPayment] Failed to notify buyer:', err));

    return res.status(200).json({
      purchaseIds: createdPurchaseIds,
      squarePaymentId: chargeResult.paymentId,
      status: anyStockRace ? 'PARTIAL_REFUND_PENDING' : 'PAID',
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[squareCartPayment] Error creating Square cart payment:', msg);
    return res.status(500).json({ error: 'Failed to process cart payment', details: msg });
  }
};

// ─── QA Test-Transaction Harness (2026-09-09) ──────────────────────────────────────────────
// isQABypassRequest reuses the SAME secret + header index.ts's isQABypassRequest (~line 407)
// and routes/auth.ts's isQABypass (~line 65) already gate QA-only behavior with. Neither of
// those is exported (both are file-local consts), so this file re-declares the identical
// 4-line check locally -- the same convention routes/auth.ts itself uses instead of importing
// from index.ts. This is layered ON TOP OF, not instead of, the organizer-auth + sale-ownership
// check inside createSquareTestTransaction below, which mirrors the actual authorization shape
// both cited precedents use (reservationController.ts's isTestTransaction branch,
// stripeController.ts's testTransaction) -- organizer role + verified ownership of the sale.
const isQABypassRequest = (req: AuthRequest): boolean => {
  const secret = process.env.QA_RATE_LIMIT_BYPASS_SECRET;
  if (!secret) return false;
  return req.headers['x-qa-bypass'] === secret;
};

/**
 * POST /api/square-payment/test-transaction
 *
 * Square QA test-settlement path. Mirrors stripeController.ts's testTransaction (POST
 * /api/stripe/test-transaction, ~line 4436) so QA can verify Square POS fee math end-to-end
 * without a real charge. Before this, squarePaymentController.ts had ZERO isTestTransaction
 * references (confirmed by grep) -- there was no sanctioned way to create a tagged Square
 * test Purchase row, so live Square QA either couldn't verify the fee math at all, or risked
 * writing an untagged real-looking row into revenue reporting -- the same "leftover test
 * account left live in production" failure pattern that has previously gotten FindA.Sale's
 * Stripe account closed by Stripe's fraud system.
 *
 * WHY THIS NEVER CALLS THE REAL SQUARE API (deliberate divergence from the Stripe precedent's
 * shape -- confirmed via code read, not assumed):
 * stripeController.ts's testTransaction calls getTestStripe() (utils/stripe.ts), a SEPARATE
 * Stripe secret key (STRIPE_TEST_SECRET_KEY) structurally isolated from any organizer's own
 * Connect account, so a "test" PaymentIntent can never touch real money or a real merchant.
 * Square has no equivalent isolated platform-level test credential in this codebase: every
 * real Square charge (createSquarePayment above, squarePosPaymentAdapter.ts) authenticates as
 * the ORGANIZER'S OWN connected access token via resolveOrganizerSquareAccessToken, and which
 * Square environment that token is valid in (sandbox vs production) is a single global env var
 * (SQUARE_ENVIRONMENT -- see utils/square.ts / squareConnectService.ts), not a separate
 * platform-level "test mode" key the way Stripe has. Calling the real Square API here would
 * mean charging a real card against a real organizer's real connected Square account whenever
 * SQUARE_ENVIRONMENT=production -- exactly the class of incident this endpoint exists to
 * prevent. Instead, this mirrors reservationController.ts's isTestTransaction branch
 * (batchUpdateHolds, ~line 1172): skip the real charge entirely, write a Purchase row tagged
 * isTestTransaction:true using the SAME fee-computation helper (buildPurchaseFeeContext,
 * defined above in this file and used by the real createSquarePayment path) so the fee math
 * is genuinely verified end-to-end without ever touching a real hold or a real charge.
 */
export const createSquareTestTransaction = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer access required' });
    }

    // Additional QA gate (dispatch-directed, layered ON TOP of the organizer-auth check
    // above -- not a replacement for it): reuses the same X-QA-Bypass /
    // QA_RATE_LIMIT_BYPASS_SECRET mechanism index.ts/routes/auth.ts already use to gate
    // QA-only behavior elsewhere in this codebase.
    if (!isQABypassRequest(req)) {
      return res.status(403).json({ message: 'QA bypass header required for test transactions' });
    }

    const { saleId, amount } = req.body as { saleId?: string; amount?: number };

    if (!saleId || typeof saleId !== 'string') {
      return res.status(400).json({ message: 'saleId is required' });
    }
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ message: 'amount must be a positive number' });
    }

    // Verify sale ownership -- same check as stripeController.ts's testTransaction
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { organizer: true },
    });
    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    if (sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'You do not own this sale' });
    }

    const amountCents = Math.round(amount * 100);
    const feeRate = getPlatformFeeRate(sale.organizer.subscriptionTier as SubscriptionTier);

    // Reuse the EXACT SAME fee-computation helper createSquarePayment (above, this file)
    // calls -- not hand-rolled. isAuctionItem is always false here: POS/test-harness
    // transactions are never auction settlements, same posture as stripeController.ts's
    // testTransaction (source: 'POS', commission-only, no buyer premium).
    const { platformFeeAmount } = buildPurchaseFeeContext({
      isAuctionItem: false,
      priceCents: amountCents,
      feePercent: feeRate,
      saleCoversFee: false,
    });
    const netAmount = (amountCents - platformFeeAmount) / 100;

    // No real Square API call -- see this function's header comment for why. Synthetic id
    // mirrors reservationController.ts's `cash_test_${randomUUID()}` convention.
    const squareTestPaymentId = `sq_test_${crypto.randomUUID()}`;

    const purchase = await prisma.purchase.create({
      data: {
        saleId,
        amount,
        platformFeeAmount: platformFeeAmount / 100,
        // FEE SNAPSHOT (2026-08-17 convention, see schema.prisma's Purchase model):
        // commission-only, same shape stripeController.ts's testTransaction writes. Test
        // rows are excluded from earnings (Purchase.isTestTransaction) but kept consistent
        // with the same reporting-visible columns as a real row.
        ...snapshotForCommissionOnly(platformFeeAmount / 100, feeRate),
        processor: 'SQUARE',
        squarePaymentId: squareTestPaymentId,
        status: 'PAID',
        source: 'POS',
        isTestTransaction: true,
      },
    });

    return res.json({
      success: true,
      transactionId: purchase.id,
      squarePaymentId: squareTestPaymentId,
      amount,
      platformFeeAmount: platformFeeAmount / 100,
      netAmount,
      message: 'Square test transaction successful. No real Square API call was made -- see createSquareTestTransaction header comment for why.',
    });
  } catch (error: any) {
    console.error('[square-test-transaction] error:', error);
    return res.status(500).json({ message: 'Test transaction failed', details: error.message });
  }
};
