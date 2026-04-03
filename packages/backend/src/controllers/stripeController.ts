import { Request, Response } from 'express';
import { getStripe } from '../utils/stripe';
import { AuthRequest } from '../middleware/auth';
import { Resend } from 'resend';
import { createNotification as createNotificationEmail } from '../services/notificationService';
import { createNotification } from '../lib/notificationService';
import { prisma } from '../lib/prisma';
import { fireWebhooks } from '../services/webhookService'; // X1
import { buildEmail } from '../services/emailTemplateService';
import { issueLoyaltyCoupon, markCouponUsed } from './couponController';
import { generateReceipt } from '../services/receiptService'; // #62: Digital receipts
import { getIO } from '../lib/socket';
import { pushEvent } from '../services/liveFeedService';
import { pushSaleStatus } from '../services/saleStatusService';
import { sendItemSoldAlert } from '../services/saleAlertEmailService';
import { awardStamp } from '../services/loyaltyService'; // Feature #29: Loyalty Passport
import { checkAndAward } from '../services/achievementService'; // Features #58-59: Achievement Badges & Streak Rewards
import { awardXp, XP_AWARDS } from '../services/xpService'; // Explorer's Guild XP awards
import { processTierLapse, recordTierResumption } from '../services/tierLapseService'; // Feature #75: Tier lapse logic
import { getClientIp } from '../utils/getClientIp'; // Platform Safety #94, #98: Client IP tracking
import { checkPaymentDuplicate, storePaymentFingerprint, logPaymentDuplicateWarning } from '../services/paymentDeduplicationService'; // Platform Safety #102
// Lazy — avoids crash when module loads before dotenv runs
const stripe = () => getStripe();

let _resend: any = null;
const getResendClient = () => {
  if (!_resend && process.env.RESEND_API_KEY) {
    try { _resend = new Resend(process.env.RESEND_API_KEY); } catch { _resend = null; }
  }
  return _resend;
};

const sendReceiptEmail = async (purchase: {
  id: string;
  amount: number;
  user: { email: string; name: string };
  item: { title: string; photoUrls?: string[] } | null;
  sale: { title: string; startDate?: Date; endDate?: Date; organizer?: { businessName: string } } | null;
  itemPrice?: number;
  buyerPremiumAmount?: number;
  buyerPremiumRate?: number;
  platformFeeAmount?: number;
  discountAmount?: number;
}) => {
  const resend = getResendClient();
  if (!resend) return;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'receipts@finda.sale';
  const historyUrl = `${process.env.FRONTEND_URL || 'https://finda.sale'}/shopper/purchases`;
  try {
    // Platform Safety #97: Post-Purchase Confirmation Email with Premium Breakdown & Enrichment
    let itemPhotoHtml = '';
    if (purchase.item?.photoUrls && purchase.item.photoUrls.length > 0) {
      itemPhotoHtml = `<img src="${purchase.item.photoUrls[0]}" alt="${purchase.item.title}" style="max-width: 300px; height: auto; border-radius: 8px; margin: 16px 0;" />`;
    }

    let breakdownHtml = '';
    if (purchase.itemPrice !== undefined) {
      const bp = purchase.buyerPremiumAmount ?? 0;
      const pf = purchase.platformFeeAmount ?? 0;
      const disc = purchase.discountAmount ?? 0;
      breakdownHtml = `
        <h3 style="margin-top: 24px; margin-bottom: 12px;">Order Summary</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
          <tr>
            <td style="padding: 8px; text-align: left;">Item Price</td>
            <td style="padding: 8px; text-align: right;"><strong>$${purchase.itemPrice.toFixed(2)}</strong></td>
          </tr>
          ${bp > 0 ? `<tr style="background-color: #f3f4f6;">
            <td style="padding: 8px; text-align: left;">Buyer Premium (5%)</td>
            <td style="padding: 8px; text-align: right;"><strong>$${bp.toFixed(2)}</strong></td>
          </tr>` : ''}
          ${pf > 0 ? `<tr>
            <td style="padding: 8px; text-align: left;">Platform Fee</td>
            <td style="padding: 8px; text-align: right;">$${pf.toFixed(2)}</td>
          </tr>` : ''}
          ${disc > 0 ? `<tr style="background-color: #d1fae5;">
            <td style="padding: 8px; text-align: left;">Discount</td>
            <td style="padding: 8px; text-align: right;">-$${disc.toFixed(2)}</td>
          </tr>` : ''}
          <tr style="border-top: 2px solid #e5e7eb; background-color: #f9fafb;">
            <td style="padding: 12px; text-align: left;"><strong>Total Paid</strong></td>
            <td style="padding: 12px; text-align: right;"><strong style="font-size: 18px;">$${purchase.amount.toFixed(2)}</strong></td>
          </tr>
        </table>
      `;
    }

    const saleDate = purchase.sale?.startDate && purchase.sale?.endDate
      ? ` (${new Date(purchase.sale.startDate).toLocaleDateString()} - ${new Date(purchase.sale.endDate).toLocaleDateString()})`
      : '';

    const organizerName = purchase.sale?.organizer?.businessName ? `<p style="margin-top: 12px; color: #6b7280; font-size: 14px;">Organized by: <strong>${purchase.sale.organizer.businessName}</strong></p>` : '';

    const html = buildEmail({
      preheader: `Receipt for ${purchase.item?.title ?? 'your purchase'} - Transaction ID: ${purchase.id.slice(0, 8)}`,
      headline: 'Your purchase is confirmed! 🎉',
      body: `<p>Hi ${purchase.user.name},</p><p>Your payment for <strong>${purchase.item?.title ?? 'an item'}</strong> from <em>${purchase.sale?.title ?? 'a sale'}${saleDate}</em> has been confirmed.</p>${itemPhotoHtml}${breakdownHtml}<p style="margin-top: 24px; font-size: 14px; color: #6b7280;"><strong>Transaction ID:</strong> ${purchase.id}</p>${organizerName}<p style="margin-top: 24px; font-size: 14px;">Thank you for your purchase! The organizer will be in touch about pickup.</p><p style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af;">This receipt serves as your purchase confirmation and acknowledgment of the buyer premium. For disputes, reference your transaction ID and contact support@finda.sale</p>`,
      ctaText: 'View Purchase History',
      ctaUrl: historyUrl,
      accentColor: '#10b981',
    });

    await resend.emails.send({
      from: fromEmail,
      to: purchase.user.email,
      subject: `Receipt: ${purchase.item?.title ?? 'Your purchase'} - Transaction ID: ${purchase.id.slice(0, 8)}`,
      html,
    });

    // Update CheckoutAttempt to track when confirmation email was sent (field lives on CheckoutAttempt, not Purchase)
    await prisma.checkoutAttempt.updateMany({
      where: { purchaseId: purchase.id },
      data: { emailSentAt: new Date() },
    });
  } catch (err) {
    console.error('Failed to send receipt email:', err);
  }
};

// Create a Stripe Connect account for an organizer
export const createConnectAccount = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id }
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    if (organizer.stripeConnectId) {
      try {
        const loginLink = await stripe().accounts.createLoginLink(organizer.stripeConnectId);
        return res.json({ url: loginLink.url });
      } catch (loginError: any) {
        if (loginError.message?.includes('not completed onboarding')) {
          const accountLink = await stripe().accountLinks.create({
            account: organizer.stripeConnectId,
            refresh_url: `${process.env.FRONTEND_URL}/organizer/dashboard`,
            return_url: `${process.env.FRONTEND_URL}/organizer/dashboard`,
            type: 'account_onboarding',
          });
          return res.json({ url: accountLink.url });
        }
        throw loginError;
      }
    }

    const account = await stripe().accounts.create({
      type: 'express',
      email: req.user.email,
      business_type: 'individual',
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    await prisma.organizer.update({
      where: { userId: req.user.id },
      data: { stripeConnectId: account.id }
    });

    const accountLink = await stripe().accountLinks.create({
      account: account.id,
      refresh_url: `${process.env.FRONTEND_URL}/organizer/dashboard`,
      return_url: `${process.env.FRONTEND_URL}/organizer/dashboard`,
      type: 'account_onboarding',
    });

    res.json({ url: accountLink.url });
  } catch (error: unknown) {
    let statusCode = 500;
    let message = 'Failed to create Stripe Connect account';
    let type = undefined;
    let errorCode = undefined;

    if (error instanceof Error) {
      type = (error as any).type;
      errorCode = (error as any).code;
      if (type === 'invalid_request_error') {
        statusCode = 400;
        if (errorCode === 'missing_field' || error.message?.includes('email')) {
          message = 'A valid email address is required for Stripe account setup';
        } else if (errorCode === 'invalid_param') {
          message = 'One or more account details are invalid. Please check your information and try again.';
        } else {
          message = error.message || 'Invalid request parameters';
        }
      } else if (type === 'rate_limit_error') {
        statusCode = 503;
        message = 'Too many requests — please try again in a minute';
      } else {
        message = error.message;
      }
    } else if (error && typeof error === 'object') {
      type = (error as any).type;
      errorCode = (error as any).code;
      if (type === 'invalid_request_error') {
        statusCode = 400;
        if (errorCode === 'missing_field' || (error as any).message?.includes('email')) {
          message = 'A valid email address is required for Stripe account setup';
        } else if (errorCode === 'invalid_param') {
          message = 'One or more account details are invalid. Please check your information and try again.';
        } else {
          message = (error as any).message || 'Invalid request to Stripe';
        }
      } else if (type === 'rate_limit_error') {
        statusCode = 503;
        message = 'Too many requests — please try again in a minute';
      }
    }

    console.error('Stripe Connect account creation error:', { type, code: errorCode, statusCode, message });
    if (statusCode === 503) res.set('Retry-After', '60');
    res.status(statusCode).json({ message });
  }
};

// P2 Bug 2: Webhook failure recovery
export const recoverPaymentIntent = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { paymentIntentId } = req.body;
    if (!paymentIntentId) {
      return res.status(400).json({ message: 'paymentIntentId is required' });
    }

    const existingPurchase = await prisma.purchase.findUnique({
      where: { stripePaymentIntentId: paymentIntentId },
    });

    if (existingPurchase) {
      return res.json({
        status: existingPurchase.status,
        purchaseId: existingPurchase.id,
        message: 'Purchase already recorded',
      });
    }

    const paymentIntent = await stripe().paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status === 'succeeded') {
      const { itemId, saleId, userId } = paymentIntent.metadata || {};
      if (!itemId || !saleId || !userId) {
        return res.status(400).json({
          message: 'Payment intent missing required metadata (itemId, saleId, userId)',
        });
      }

      const purchase = await prisma.purchase.create({
        data: {
          userId,
          itemId,
          saleId,
          amount: paymentIntent.amount_received / 100,
          platformFeeAmount: (paymentIntent.application_fee_amount || 0) / 100,
          stripePaymentIntentId: paymentIntent.id,
          status: 'PAID',
        },
      });

      const updatedItem = await prisma.item.update({
        where: { id: itemId },
        data: { status: 'SOLD' },
      }).catch(err => console.warn('Failed to update item status during recovery:', err));

      if (updatedItem) {
        try {
          const io = getIO();
          pushEvent(io, updatedItem.saleId, {
            type: 'SOLD',
            itemTitle: updatedItem.title,
            amount: updatedItem.price || undefined,
            saleId: updatedItem.saleId,
            timestamp: new Date(),
          });
        } catch (err) {
          console.warn('[liveFeed] Failed to emit sold event:', err);
        }
      }

      return res.json({
        status: 'PAID',
        purchaseId: purchase.id,
        message: 'Purchase recovered from Stripe',
      });
    }

    return res.json({
      status: paymentIntent.status,
      message: `Payment intent status: ${paymentIntent.status}`,
    });
  } catch (error: unknown) {
    console.error('Payment recovery error:', error);
    res.status(500).json({ message: 'Failed to recover payment intent' });
  }
};

// Create a payment intent for purchasing an item
export const createPaymentIntent = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { itemId, affiliateLinkId, shippingRequested, couponCode } = req.body;

    if (!itemId) {
      return res.status(400).json({ message: 'Item ID is required' });
    }

    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: {
        sale: {
          select: {
            id: true,
            isAuctionSale: true,
            saleType: true,
            title: true,
            address: true,
            city: true,
            state: true,
            startDate: true,
            endDate: true,
            organizerId: true,
            organizer: {
              select: { stripeConnectId: true, userId: true, referralDiscountExpiry: true }
            }
          }
        }
      }
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    if (item.status !== 'AVAILABLE') {
      return res.status(409).json({ message: `Item is no longer available (status: ${item.status})` });
    }

    if (!item.sale.organizer.stripeConnectId) {
      return res.status(400).json({ message: 'Organizer has not set up payment processing' });
    }

    if (item.sale.organizer.userId === req.user.id) {
      return res.status(400).json({ message: 'You cannot purchase items from your own sale' });
    }

    // Determine if auction based on listingType (preferred) or fallback to auctionStartPrice
    const isAuctionItem = item.listingType === 'AUCTION' || !!item.auctionStartPrice;
    let price: number;
    if (isAuctionItem) {
      if (item.currentBid != null) {
        price = item.currentBid;
      } else if (item.auctionStartPrice != null) {
        price = item.auctionStartPrice;
      } else {
        price = 0;
      }
    } else if (item.price != null) {
      price = item.price;
    } else {
      price = 0;
    }

    if (isNaN(price) || price <= 0) {
      return res.status(400).json({ message: 'Invalid price value' });
    }

    if (price < 0.5) {
      return res.status(400).json({ message: 'Item price must be at least $0.50 to process payment' });
    }

    // Buyer premium (5%) applies ONLY to auction items
    const BUYER_PREMIUM_RATE = 0.05; // Platform Safety #96: 5% buyer premium
    let buyerPremiumAmount = 0;
    if (isAuctionItem) {
      buyerPremiumAmount = Math.round(price * 100 * BUYER_PREMIUM_RATE);
    }

    let shippingCost = 0;
    if (shippingRequested && !isAuctionItem && item.shippingAvailable && item.shippingPrice != null) {
      shippingCost = item.shippingPrice;
    }

    const feeStructure = await prisma.feeStructure.findFirst({ where: { listingType: '*' } });
    const baseFeePercent = feeStructure?.feeRate ?? 0.10;

    const discountExpiry = item.sale.organizer.referralDiscountExpiry;
    const hasReferralDiscount = discountExpiry != null && discountExpiry > new Date();
    const feePercent = hasReferralDiscount ? 0 : baseFeePercent;

    const priceCents = Math.round((price + shippingCost) * 100);
    // For regular items: fee is taken from organizer payout (application_fee_amount only), buyer sees item price + shipping only
    // For auction items: buyer pays winning bid + 5% premium; 5% is taken as application_fee_amount
    const totalWithBuyerPremium = priceCents + buyerPremiumAmount;
    const platformFeeAmount = isAuctionItem
      ? buyerPremiumAmount  // Auction: 5% buyer premium = application_fee
      : Math.round(priceCents * feePercent);  // Regular: 10% platform fee on item + shipping

    let couponId: string | undefined;
    let discountAmount = 0;
    if (couponCode) {
      const coupon = await prisma.coupon.findUnique({ where: { code: (couponCode as string).trim().toUpperCase() } });
      if (!coupon || coupon.userId !== req.user.id || coupon.status !== 'ACTIVE' || coupon.expiresAt < new Date()) {
        return res.status(400).json({ message: 'Invalid or expired coupon code' });
      }
      if (coupon.discountType === 'FIXED') {
        discountAmount = Math.min(Math.round(coupon.discountValue * 100), priceCents - 50);
      } else {
        const pct = Math.round(priceCents * (coupon.discountValue / 100));
        const raw = coupon.maxDiscountAmount
          ? Math.min(pct, Math.round(coupon.maxDiscountAmount * 100))
          : pct;
        discountAmount = Math.min(raw, priceCents - 50);
      }
      couponId = coupon.id;
    }
    const finalPriceCents = isAuctionItem
      ? totalWithBuyerPremium + platformFeeAmount - discountAmount  // Auction: item + premium - discount, all charged to buyer
      : totalWithBuyerPremium - discountAmount;                     // Regular: item + shipping - discount only (platform fee from organizer payout)

    const couponSuffix = couponId ? `-c${couponId.slice(-6)}` : '';
    const idempotencyKey = `pi-${itemId}-${req.user.id}${couponSuffix}`;

    let paymentIntent;
    const stripeConnectId = item.sale.organizer.stripeConnectId;
    const shouldUseConnect = stripeConnectId && !stripeConnectId.startsWith('acct_test_');

    const basePaymentIntentData = {
      amount: finalPriceCents,
      currency: 'usd',
      metadata: {
        itemId: item.id,
        saleId: item.sale.id,
        userId: req.user.id,
        ...(affiliateLinkId ? { affiliateLinkId } : {}),
        ...(shippingCost > 0 ? { shippingCost: String(shippingCost) } : {}),
        ...(couponId ? { couponId } : {}),
      },
    };

    try {
      // First attempt: with Connect routing if organizer has valid account
      paymentIntent = await stripe().paymentIntents.create(
        shouldUseConnect
          ? {
              ...basePaymentIntentData,
              application_fee_amount: platformFeeAmount,
              on_behalf_of: stripeConnectId,
              transfer_data: { destination: stripeConnectId },
            }
          : basePaymentIntentData,
        { idempotencyKey }
      );
    } catch (stripeError: any) {
      // Fallback: if Connect routing fails due to incomplete onboarding, retry without it
      if (
        shouldUseConnect &&
        (stripeError.code === 'insufficient_capabilities_for_transfer' ||
          (stripeError.type === 'StripeInvalidRequestError' &&
            stripeError.message?.includes('insufficient_capabilities_for_transfer')))
      ) {
        console.warn(
          `[Stripe Connect fallback] Account ${stripeConnectId} not fully onboarded, proceeding without Connect routing`,
          { errorCode: stripeError.code }
        );
        // Retry without Connect data — use a different idempotency key (Stripe rejects same key with different params)
        paymentIntent = await stripe().paymentIntents.create(basePaymentIntentData, { idempotencyKey: `${idempotencyKey}-fallback` });
      } else {
        throw stripeError;
      }
    }

    const purchase = await prisma.purchase.create({
      data: {
        userId: req.user.id,
        itemId: item.id,
        saleId: item.sale.id,
        amount: finalPriceCents / 100,
        platformFeeAmount: platformFeeAmount / 100,
        stripePaymentIntentId: paymentIntent.id,
        status: 'PENDING',
        ...(affiliateLinkId ? { affiliateLinkId } : {})
      }
    });

    await prisma.checkoutAttempt.upsert({
      where: { paymentIntent: paymentIntent.id },
      create: {
        userId: req.user.id,
        itemId: item.id,
        paymentIntent: paymentIntent.id,
      },
      update: {},
    }).catch(err => console.warn('[checkout-recovery] Failed to track checkout attempt:', err));

    // Platform Safety #98: Save CheckoutEvidence for chargeback defense
    const clientIp = getClientIp(req);
    const acknowledgmentText = `I acknowledge the buyer premium of ${(BUYER_PREMIUM_RATE * 100).toFixed(0)}% will be added to my total purchase price.`;
    prisma.checkoutEvidence.create({
      data: {
        purchaseId: purchase.id,
        checkoutTimestamp: new Date(),
        checkoutIp: clientIp !== 'unknown' ? clientIp : null,
        acknowledgmentText: acknowledgmentText
      }
    }).catch(err => console.warn('[checkoutEvidence] Failed to save checkout evidence:', err));

    // Format sale dates for display
    const saleStartDate = item.sale.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const saleEndDate = item.sale.endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const saleDates = `${saleStartDate} - ${saleEndDate}`;

    res.json({
      clientSecret: paymentIntent.client_secret,
      purchaseId: purchase.id,
      // Platform Safety #96: Buyer Premium Disclosure (4-Point Visibility)
      subtotal: price,
      buyerPremiumRate: isAuctionItem ? BUYER_PREMIUM_RATE : 0,
      buyerPremiumAmount: buyerPremiumAmount / 100,
      platformFee: platformFeeAmount / 100,
      discountApplied: discountAmount / 100,
      totalAmount: finalPriceCents / 100,
      // Legacy fields for backwards compatibility
      originalAmount: price,
      buyerPremium: buyerPremiumAmount / 100,
      saleName: item.sale.title,
      saleAddress: `${item.sale.address}, ${item.sale.city}, ${item.sale.state}`,
      saleDates: saleDates,
      ...(couponCode ? { couponCode } : {}),
    });
  } catch (error: unknown) {
    console.error('Payment Intent creation error:', error);
    let statusCode = 500;
    let message = 'Failed to create payment intent';

    if (error instanceof Error) {
      const stripeError = error as any;
      // Catch any remaining Connect-related errors (should be rare after fallback)
      if (stripeError.code === 'insufficient_capabilities_for_transfer') {
        statusCode = 400;
        message = 'Payment setup incomplete. The organizer needs to finish setting up payments.';
      } else if (stripeError.type === 'StripeInvalidRequestError') {
        statusCode = 400;
        message = stripeError.message || 'Invalid payment request. Please try again.';
      }
    }

    res.status(statusCode).json({ error: message });
  }
};

// Webhook handler for Stripe events
export const webhookHandler = async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!endpointSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not configured — webhook verification cannot proceed');
    return res.status(500).send('Webhook Error: STRIPE_WEBHOOK_SECRET not configured');
  }

  let event;

  try {
    event = stripe().webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed.', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    const existingEvent = await prisma.processedWebhookEvent.findUnique({
      where: { eventId: event.id }
    });
    if (existingEvent) {
      console.warn(`[webhook] Duplicate event detected: ${event.id} (type: ${event.type}) — skipping reprocessing`);
      return res.json({ received: true, duplicate: true });
    }
  } catch (err) {
    console.warn(`[webhook] Failed to check idempotency for event ${event.id}:`, err);
  }

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object;
      const purchase = await prisma.purchase.findUnique({
        where: { stripePaymentIntentId: paymentIntent.id },
        include: {
          user: { select: { id: true, email: true, name: true } },
          item: { select: { title: true, photoUrls: true } },
          sale: {
            select: {
              title: true,
              startDate: true,
              endDate: true,
              organizer: { select: { stripeConnectId: true, userId: true, businessName: true } },
            },
          },
        },
      });

      // Platform Safety #102: Capture and store payment method fingerprint
      if (purchase?.user?.id && paymentIntent.payment_method) {
        try {
          const paymentMethod = await stripe().paymentMethods.retrieve(paymentIntent.payment_method as string);
          if (paymentMethod.card?.fingerprint) {
            // Check for duplicate payment methods across accounts
            const { isDuplicate, otherUserIds } = await checkPaymentDuplicate(paymentMethod.card.fingerprint, purchase.user.id);
            if (isDuplicate && otherUserIds.length > 0) {
              logPaymentDuplicateWarning(purchase.user.id, paymentMethod.card.fingerprint, otherUserIds);
            }
            // Store fingerprint on user account
            await storePaymentFingerprint(purchase.user.id, paymentMethod.card.fingerprint);
          }
        } catch (err) {
          console.warn('[stripe] Failed to capture payment method fingerprint:', err);
        }
      }

      if (purchase) {
        const expectedConnectId = purchase.sale?.organizer?.stripeConnectId;
        if (
          expectedConnectId &&
          paymentIntent.on_behalf_of &&
          expectedConnectId !== paymentIntent.on_behalf_of
        ) {
          console.error(
            `ST3 webhook mismatch for PI ${paymentIntent.id}: ` +
            `expected connectId=${expectedConnectId}, got=${paymentIntent.on_behalf_of}`
          );
          break;
        }

        await prisma.purchase.update({
          where: { stripePaymentIntentId: paymentIntent.id },
          data: { status: 'PAID' },
        });

        // #119: Track successful transaction for chargeback rate monitoring
        const monthYear = new Date().toISOString().slice(0, 7); // "2026-03"
        await prisma.platformMetrics.upsert({
          where: { monthYear },
          create: { monthYear, chargebackCount: 0, transactionCount: 1 },
          update: { transactionCount: { increment: 1 } }
        });

        // Award XP to shopper for completing purchase (only if user exists — not for POS walk-ins)
        if (purchase.userId) {
          awardXp(purchase.userId, 'PURCHASE_COMPLETED', XP_AWARDS.PURCHASE, {
            itemId: purchase.itemId ?? undefined,
            saleId: purchase.saleId ?? undefined
          }).catch(err =>
            console.error('[XP] Failed to award XP for purchase completed:', err)
          );
        }

        // Notify organizer of payment received
        if (purchase.sale?.organizer?.userId) {
          createNotification({
            userId: purchase.sale.organizer.userId,
            type: 'payment_received',
            title: 'Payment received',
            body: `Payment of $${(paymentIntent.amount_received / 100).toFixed(2)} received for "${purchase.item?.title || 'item'}"`,
            link: `/organizer/sales/${purchase.saleId}`,
            channel: 'OPERATIONAL',
          }).catch(() => {});
        }

        setImmediate(() => {
          generateReceipt(purchase.id).catch(err => console.error('[receipt] Failed to generate receipt:', err));
        });

        await prisma.checkoutAttempt.updateMany({
          where: { paymentIntent: paymentIntent.id },
          data: { completedAt: new Date() },
        }).catch(err => console.warn('[checkout-recovery] Failed to mark checkout as completed:', err));

        if (paymentIntent.metadata?.itemId) {
          const item = await prisma.item.findUnique({
            where: { id: paymentIntent.metadata.itemId },
            select: { status: true },
          });

          if (item && item.status === 'SOLD' && purchase.status !== 'PAID') {
            console.warn(
              `CA3 concurrent purchase: item ${paymentIntent.metadata.itemId} already SOLD, ` +
              `refunding PI ${paymentIntent.id}`
            );
            await stripe().refunds.create({ payment_intent: paymentIntent.id });
            await prisma.purchase.update({
              where: { stripePaymentIntentId: paymentIntent.id },
              data: { status: 'REFUNDED' },
            });
            break;
          }

          const soldItem = await prisma.item.update({
            where: { id: paymentIntent.metadata.itemId },
            data: { status: 'SOLD' },
          });

          if (soldItem) {
            try {
              const io = getIO();
              pushEvent(io, soldItem.saleId, {
                type: 'SOLD',
                itemTitle: soldItem.title,
                amount: soldItem.price || undefined,
                saleId: soldItem.saleId,
                timestamp: new Date(),
              });
            } catch (err) {
              console.warn('[liveFeed] Failed to emit sold event:', err);
            }

            try {
              const io = getIO();
              await pushSaleStatus(io, soldItem.saleId);
            } catch (err) {
              console.warn('[saleStatus] Failed to push status update:', err);
            }

            try {
              const saleData = await prisma.sale.findUnique({
                where: { id: soldItem.saleId },
                include: { organizer: { include: { user: { select: { email: true, name: true } } } } },
              });
              if (saleData?.organizer?.user) {
                setImmediate(() => {
                  sendItemSoldAlert({
                    organizerEmail: saleData.organizer.user.email,
                    organizerName: saleData.organizer.user.name,
                    itemTitle: soldItem.title,
                    saleTitle: saleData.title,
                    price: soldItem.price || 0,
                    saleId: soldItem.saleId,
                  }).catch(err => console.warn('[alert] Failed to send item sold email:', err));
                });
              }
            } catch (err) {
              console.warn('[alert] Failed to fetch sale for item sold alert:', err);
            }
          }
        }

        if (purchase.affiliateLinkId) {
          await prisma.affiliateLink.update({
            where: { id: purchase.affiliateLinkId },
            data: { conversions: { increment: 1 } }
          }).catch(err => console.warn('Failed to increment affiliate conversion:', err));
        }

        const isPOS = paymentIntent.metadata?.source === 'POS';

        if (!isPOS && purchase.userId) {
          checkAndAward(purchase.userId, 'PURCHASE_MADE')
            .catch(err => console.warn('[achievement] Failed to award purchase achievement:', err));

          awardStamp(purchase.userId, 'MAKE_PURCHASE', purchase.saleId ?? undefined)
            .catch(err => console.warn('[loyalty] Failed to award purchase stamp:', err));

          issueLoyaltyCoupon(purchase.userId, purchase.id)
            .catch(err => console.warn('[coupon] Failed to issue loyalty coupon:', err));

          if (paymentIntent.metadata?.couponId) {
            markCouponUsed(paymentIntent.metadata.couponId, purchase.id)
              .catch(err => console.warn('[coupon] Failed to mark coupon used:', err));
          }

          createNotification({
            userId: purchase.userId,
            type: 'purchase',
            title: 'Purchase confirmed',
            body: `Your purchase of "${purchase.item?.title || 'item'}" is confirmed!`,
            link: '/shopper/purchases',
            channel: 'OPERATIONAL'
          }).catch(err => console.error('[notification] Failed to create purchase notification:', err));
        }

        if (!isPOS && purchase.user) {
          // Platform Safety #97: Calculate itemized breakdown for receipt
          // We don't have full itemization data in webhook context, but we have the totals
          // Frontend-side reconstruction or enhanced tracking would improve this
          await sendReceiptEmail({
            id: purchase.id,
            amount: purchase.amount,
            user: { email: purchase.user.email, name: purchase.user.name },
            item: purchase.item,
            sale: purchase.sale,
            // Note: For full itemization, the frontend should include this in metadata
            // or we could implement a payment_intent.amount_capturable event hook
          });
        }

        const orgUserId = (purchase.sale as any)?.organizer?.userId;
        if (orgUserId) {
          setImmediate(() =>
            fireWebhooks(orgUserId, 'purchase.completed', {
              purchaseId: purchase.id,
              itemId: paymentIntent.metadata?.itemId,
              itemTitle: purchase.item?.title,
              amount: purchase.amount,
              buyerEmail: purchase.user?.email,
            })
          );
        }
      }
      break;
    }
    case 'payment_intent.payment_failed': {
      const paymentFailedIntent = event.data.object;
      await prisma.purchase.updateMany({
        where: { stripePaymentIntentId: paymentFailedIntent.id },
        data: { status: 'FAILED' },
      });
      break;
    }
    case 'charge.dispute.created': {
      // P0 Fix 1: Handle chargeback/dispute events
      // Feature #107: Track chargebacks for reputation/suspension logic
      const dispute = event.data.object;
      console.log(`[stripe] Chargeback initiated: dispute_id=${dispute.id}, charge_id=${dispute.charge}`);

      try {
        // dispute.charge may be a string ID or an expanded Charge object — normalize to string
        const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge.id;
        const charge = await stripe().charges.retrieve(chargeId);
        // charge.payment_intent may be a string ID or an expanded PaymentIntent object — normalize
        const paymentIntentId = typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : charge.payment_intent?.id ?? null;
        if (paymentIntentId) {
          const purchase = await prisma.purchase.findUnique({
            where: { stripePaymentIntentId: paymentIntentId },
            include: { item: { include: { sale: true } }, user: true }
          });
          if (purchase && purchase.item?.sale) {
            await prisma.purchase.update({
              where: { id: purchase.id },
              data: { status: 'DISPUTED' }
            });
            console.log(`[stripe] Purchase marked DISPUTED: purchase_id=${purchase.id}, dispute_id=${dispute.id}`);

            // Feature #107: Increment chargebackCount on buyer's User record
            if (purchase.user) {
              await prisma.user.update({
                where: { id: purchase.user.id },
                data: { chargebackCount: { increment: 1 } },
              });

              // Fetch updated user to check suspension threshold
              const updatedUser = await prisma.user.findUnique({
                where: { id: purchase.user.id },
                select: { chargebackCount: true, suspendedAt: true },
              });

              // Suspend after 3+ chargebacks
              if (updatedUser && updatedUser.chargebackCount >= 3 && !updatedUser.suspendedAt) {
                await prisma.user.update({
                  where: { id: purchase.user.id },
                  data: {
                    suspendedAt: new Date(),
                    suspendReason: 'SERIAL_CHARGEBACKS',
                  },
                });
                console.warn(
                  `[stripe] Buyer suspended after chargeback #${updatedUser.chargebackCount}: user=${purchase.user.id}`
                );
              }
            }

            // Feature #107: Record chargeback incident in fraud tracking
            const { recordChargebackIncident } = await import('../services/fraudService');
            await recordChargebackIncident(
              purchase.item.sale.organizerId,
              purchase.id,
              dispute.id
            );

            // #119: Track chargeback in PlatformMetrics for monitoring
            const monthYear = new Date().toISOString().slice(0, 7); // "2026-03"
            const metrics = await prisma.platformMetrics.upsert({
              where: { monthYear },
              create: { monthYear, chargebackCount: 1, transactionCount: 1 },
              update: { chargebackCount: { increment: 1 } }
            });

            // Alert if chargeback rate exceeds 0.8%
            if (metrics.transactionCount > 0 && metrics.chargebackCount / metrics.transactionCount > 0.008) {
              console.error(`[stripe] ALERT: Chargeback rate exceeded 0.8% for ${monthYear}:`, metrics);
            }
          }
        }
      } catch (err) {
        console.error(`[stripe] Failed to process dispute ${dispute.id}:`, err);
      }
      break;
    }
    case 'customer.subscription.deleted': {
      // Feature #75: Tier Lapse State Logic — Subscription cancelled
      const subscription = event.data.object;
      const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

      const organizer = await prisma.organizer.findFirst({
        where: { stripeCustomerId: customerId },
        include: { user: { select: { email: true, name: true, id: true } } }
      });

      if (!organizer) {
        console.warn(`[webhook] Subscription deleted for unknown customer ${customerId}`);
        break;
      }

      // Downgrade to SIMPLE in Organizer table
      await prisma.organizer.update({
        where: { id: organizer.id },
        data: {
          subscriptionTier: 'SIMPLE',
          subscriptionStatus: 'canceled',
          stripeSubscriptionId: null,
          tokenVersion: organizer.tokenVersion + 1, // Invalidate stale JWT tier claims
        }
      });

      // Also process tier lapse in UserRoleSubscription (Feature #75)
      const roleSubscription = await prisma.userRoleSubscription.findFirst({
        where: {
          userId: organizer.user.id,
          role: 'ORGANIZER',
        },
      });

      if (roleSubscription) {
        try {
          await processTierLapse(roleSubscription.id);
          console.log(`[tier-lapse] Tier lapsed for subscription ${roleSubscription.id}`);
        } catch (err) {
          console.error(`[tier-lapse] Failed to process tier lapse for ${roleSubscription.id}:`, err);
        }
      }

      // Fire async job: send "Tier Lapsed" email
      setImmediate(() => {
        const resend = getResendClient();
        if (resend && organizer.user?.email) {
          const fromEmail = process.env.RESEND_FROM_EMAIL || 'notifications@finda.sale';
          resend.emails.send({
            from: fromEmail,
            to: organizer.user.email,
            subject: 'Your FindA.Sale PRO subscription has been canceled',
            html: `<p>Hi ${organizer.user.name || 'Organizer'},</p><p>Your FindA.Sale subscription has been canceled. You've been downgraded to SIMPLE tier.</p>`,
          }).catch((err: unknown) => console.warn('[tier-lapse] Failed to send lapse email:', err));
        }
      });

      break;
    }
    case 'invoice.payment_failed': {
      // Feature #75: Tier Lapse State Logic — Payment failure, grace period begins
      const invoice = event.data.object;
      const rawCustomer = invoice.customer;
      if (!rawCustomer) break;
      const customerId = typeof rawCustomer === 'string' ? rawCustomer : rawCustomer.id;

      const organizer = await prisma.organizer.findFirst({
        where: { stripeCustomerId: customerId },
        include: { user: { select: { email: true, name: true } } }
      });

      if (!organizer) {
        console.warn(`[webhook] Payment failed for unknown customer ${customerId}`);
        break;
      }

      // Mark subscription as past_due but do NOT downgrade yet (grace period)
      await prisma.organizer.update({
        where: { id: organizer.id },
        data: {
          subscriptionStatus: 'past_due',
        }
      });

      // Fire async job: send "Payment Failed" email with retry link
      setImmediate(() => {
        const resend = getResendClient();
        if (resend && organizer.user?.email) {
          const fromEmail = process.env.RESEND_FROM_EMAIL || 'notifications@finda.sale';
          const baseUrl = process.env.FRONTEND_URL || 'https://finda.sale';
          resend.emails.send({
            from: fromEmail,
            to: organizer.user.email,
            subject: 'Action required: Your FindA.Sale payment failed',
            html: `<p>Hi ${organizer.user.name || 'Organizer'},</p><p>Your recent payment for FindA.Sale failed. Please update your payment method: <a href="${baseUrl}/organizer/billing">Update Payment</a></p><p>You have 3 days to retry.</p>`,
          }).catch((err: unknown) => console.warn('[payment-failed] Email send failed:', err));
        }
      });

      break;
    }
    case 'customer.subscription.updated': {
      // Feature #75: Tier Lapse State Logic — Resume or upgrade after lapse/payment recovery
      const subscription = event.data.object;
      const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

      const organizer = await prisma.organizer.findFirst({
        where: { stripeCustomerId: customerId },
        include: { user: { select: { id: true } } }
      });

      if (!organizer) {
        console.warn(`[webhook] Subscription updated for unknown customer ${customerId}`);
        break;
      }

      // If resuming from past_due or canceled, update tier and record resumption
      const wasPastDueOrCanceled = organizer.subscriptionStatus === 'past_due' || organizer.subscriptionStatus === 'canceled';
      const isNowActive = subscription.status === 'active';

      if (wasPastDueOrCanceled && isNowActive) {
        // Map Stripe price ID to tier
        let newTier: 'SIMPLE' | 'PRO' | 'TEAMS' = 'SIMPLE';
        if (subscription.items?.data?.[0]?.price?.id) {
          const priceId = subscription.items.data[0].price.id;
          if (priceId === 'price_1TDUQsLTUdEUnHOTzG6cVDwu') newTier = 'PRO';
          else if (priceId === 'price_1TDUQtLTUdEUnHOTCEoNL6oz') newTier = 'TEAMS';
        }

        await prisma.organizer.update({
          where: { id: organizer.id },
          data: {
            subscriptionTier: newTier,
            subscriptionStatus: subscription.status,
            tokenVersion: organizer.tokenVersion + 1, // Invalidate stale JWTs
          }
        });

        // Record tier resumption in UserRoleSubscription (Feature #75)
        const roleSubscription = await prisma.userRoleSubscription.findFirst({
          where: {
            userId: organizer.user.id,
            role: 'ORGANIZER',
          },
        });

        if (roleSubscription) {
          try {
            await recordTierResumption(roleSubscription.id);
            console.log(`[tier-lapse] Tier resumed for subscription ${roleSubscription.id}`);
          } catch (err: unknown) {
            console.error(`[tier-lapse] Failed to record tier resumption for ${roleSubscription.id}:`, err);
          }
        }
      } else if (subscription.status === 'active' || subscription.status === 'past_due') {
        // Normal update: sync subscription status and tier with Stripe
        let newTier: 'SIMPLE' | 'PRO' | 'TEAMS' = 'SIMPLE';
        if (subscription.items?.data?.[0]?.price?.id) {
          const priceId = subscription.items.data[0].price.id;
          if (priceId === 'price_1TDUQsLTUdEUnHOTzG6cVDwu') newTier = 'PRO';
          else if (priceId === 'price_1TDUQtLTUdEUnHOTCEoNL6oz') newTier = 'TEAMS';
        }

        await prisma.organizer.update({
          where: { id: organizer.id },
          data: {
            subscriptionStatus: subscription.status,
            subscriptionTier: newTier,
          }
        });
      }

      break;
    }
    case 'checkout.session.completed': {
      // #132: À La Carte Single-Sale Fee ($9.99)
      const session = event.data.object;
      if (session.metadata?.type === 'ALA_CARTE' && session.metadata?.saleId) {
        await prisma.sale.update({
          where: { id: session.metadata.saleId },
          data: {
            alaCarteFeePaid: true,
            purchaseModel: 'ALA_CARTE',
            alaCarte: true,
          },
        }).catch(err => console.error('[ala-carte] Failed to update sale after checkout:', err));
      }
      // Hold-to-Pay Phase 2: Handle checkout session completion for invoices
      if (session.payment_intent) {
        // Retrieve the payment intent to get full metadata
        const paymentIntent = await stripe().paymentIntents.retrieve(session.payment_intent as string);
        if (paymentIntent.metadata?.invoiceId) {
          // This is a hold-to-pay invoice — wait for charge.succeeded for actual payment
          console.log(`[hold-to-pay] Checkout session completed for invoice ${paymentIntent.metadata.invoiceId}`);
        }
      }
      break;
    }
    case 'charge.succeeded': {
      // Hold-to-Pay Phase 2: Handle successful charge for hold invoices
      const charge = event.data.object;
      if (charge.payment_intent) {
        const paymentIntent = await stripe().paymentIntents.retrieve(charge.payment_intent as string);
        if (paymentIntent.metadata?.invoiceId) {
          const invoiceId = paymentIntent.metadata.invoiceId;

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
            console.error(`[hold-invoice] Invoice not found: ${invoiceId}`);
            break;
          }

          // Idempotency check: if already paid, skip
          if (holdInvoice.status === 'PAID') {
            console.warn(`[hold-invoice] Invoice ${invoiceId} already paid, skipping duplicate webhook`);
            break;
          }

          // Fetch all items and reservations bundled in this invoice
          const bundledItems = await prisma.item.findMany({
            where: { id: { in: holdInvoice.itemIds } },
          });

          const bundledReservations = await prisma.itemReservation.findMany({
            where: { itemId: { in: holdInvoice.itemIds } },
          });

          // LOCKED DECISION #1: Calculate organizer payout (total amount - platform fee - Stripe fee)
          const stripeFeeAmount = (charge.amount - (charge.amount - (charge.amount_refunded || 0))) / 100; // convert from cents
          const organizerPayout = (holdInvoice.totalAmount / 100) - (holdInvoice.platformFeeAmount / 100) - stripeFeeAmount;

          // Update invoice status to PAID
          await prisma.$transaction(async (tx) => {
            await tx.holdInvoice.update({
              where: { id: invoiceId },
              data: {
                status: 'PAID',
                paidAt: new Date(),
                stripePaymentIntentId: charge.payment_intent as string,
                stripeFeeAmount: Math.round(stripeFeeAmount * 100),
              },
            });

            // Update ALL bundled ItemReservations to CONFIRMED
            await tx.itemReservation.updateMany({
              where: { itemId: { in: holdInvoice.itemIds } },
              data: { status: 'CONFIRMED' },
            });

            // Update ALL bundled items to SOLD (LOCKED DECISION #6)
            await tx.item.updateMany({
              where: { id: { in: holdInvoice.itemIds } },
              data: { status: 'SOLD' },
            });

            // LOCKED DECISION #5: Create notifications for shopper and organizer
            const itemList = bundledItems.length > 1
              ? `${bundledItems.length} items`
              : `"${bundledItems[0]?.title}"`;

            await tx.notification.createMany({
              data: [
                {
                  userId: holdInvoice.shopperUserId,
                  type: 'payment_completed',
                  title: 'Payment confirmed',
                  body: `Payment confirmed for ${itemList}. The organizer will send shipping/pickup details.`,
                  link: `/items/${holdInvoice.itemIds[0]}`,
                  channel: 'OPERATIONAL',
                },
                {
                  userId: holdInvoice.organizerUserId,
                  type: 'payment_received',
                  title: 'Payment received',
                  body: `Payment of $${organizerPayout.toFixed(2)} received for ${itemList}. Payout pending.`,
                  link: `/organizer/sales/${holdInvoice.saleId}`,
                  channel: 'OPERATIONAL',
                },
              ],
            });
          });

          // Award XP to shopper (+15 guildXP for payment completion)
          try {
            const { awardXp, XP_AWARDS } = await import('../services/xpService');
            await awardXp(holdInvoice.shopperUserId, 'PAYMENT_COMPLETED', 15, {
              saleId: holdInvoice.saleId,
            });
          } catch (err) {
            console.warn('[hold-invoice] Failed to award XP:', err);
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
            console.warn('[hold-invoice] Failed to emit socket event:', err);
          }

          // Send confirmation emails (fire-and-forget)
          setImmediate(() => {
            const resend = getResendClient();
            if (resend) {
              const fromEmail = process.env.RESEND_FROM_EMAIL || 'invoices@finda.sale';
              const itemList = bundledItems.length > 1
                ? `${bundledItems.length} items from ${holdInvoice.sale.title}`
                : bundledItems[0]?.title;
              const totalPaid = (holdInvoice.totalAmount / 100).toFixed(2);
              const platformFee = (holdInvoice.platformFeeAmount / 100).toFixed(2);

              // Email to shopper
              resend.emails.send({
                from: fromEmail,
                to: holdInvoice.shopper.email,
                subject: `Payment confirmed for ${itemList}`,
                html: `
                  <h2>Payment Confirmed</h2>
                  <p>Hi ${holdInvoice.shopper.name},</p>
                  <p>Your payment of $${totalPaid} for <strong>${itemList}</strong> has been confirmed.</p>
                  <p>The organizer will contact you soon about shipping or pickup details.</p>
                  <p style="color: #6b7280; font-size: 14px;">Transaction ID: ${invoiceId.slice(0, 8)}</p>
                `,
              }).catch((err: unknown) => console.warn('[hold-invoice] Failed to send shopper email:', err));

              // Email to organizer
              resend.emails.send({
                from: fromEmail,
                to: holdInvoice.organizer.email,
                subject: `Payment received: ${itemList}`,
                html: `
                  <h2>Payment Received</h2>
                  <p>Hi ${holdInvoice.organizer.name},</p>
                  <p>Payment of $${organizerPayout.toFixed(2)} has been received for <strong>${itemList}</strong>.</p>
                  <p>Payout will be transferred to your Stripe Connect account within 1-2 business days.</p>
                  <p style="color: #6b7280; font-size: 14px;">Platform fee: $${platformFee} | Stripe fee: $${stripeFeeAmount.toFixed(2)}</p>
                `,
              }).catch((err: unknown) => console.warn('[hold-invoice] Failed to send organizer email:', err));
            }
          });

          console.log(`[hold-invoice] Payment completed for invoice ${invoiceId} (${bundledItems.length} items): organizer payout $${organizerPayout.toFixed(2)}`);
        }
      }
      break;
    }
    case 'charge.failed': {
      // Hold-to-Pay Phase 2: Handle failed charge for hold invoices
      const charge = event.data.object;
      if (charge.payment_intent) {
        const paymentIntent = await stripe().paymentIntents.retrieve(charge.payment_intent as string);
        if (paymentIntent.metadata?.invoiceId) {
          const invoiceId = paymentIntent.metadata.invoiceId;

          const holdInvoice = await prisma.holdInvoice.findUnique({
            where: { id: invoiceId },
          });

          if (!holdInvoice) {
            console.error(`[hold-invoice] Invoice not found for failed charge: ${invoiceId}`);
            break;
          }

          // Fetch all bundled items and reservations
          const bundledItems = await prisma.item.findMany({
            where: { id: { in: holdInvoice.itemIds } },
          });

          const bundledReservations = await prisma.itemReservation.findMany({
            where: { itemId: { in: holdInvoice.itemIds } },
          });

          // Update invoice status to EXPIRED
          await prisma.$transaction(async (tx) => {
            await tx.holdInvoice.update({
              where: { id: invoiceId },
              data: {
                status: 'EXPIRED',
              },
            });

            // Reactivate holds: return ALL ItemReservations to CONFIRMED and items to RESERVED
            await tx.itemReservation.updateMany({
              where: { itemId: { in: holdInvoice.itemIds } },
              data: { status: 'CONFIRMED' },
            });

            await tx.item.updateMany({
              where: { id: { in: holdInvoice.itemIds } },
              data: { status: 'RESERVED' },
            });

            // Notify shopper of payment failure
            const itemList = bundledItems.length > 1
              ? `${bundledItems.length} items`
              : `"${bundledItems[0]?.title}"`;

            await tx.notification.create({
              data: {
                userId: holdInvoice.shopperUserId,
                type: 'payment_failed',
                title: 'Payment failed',
                body: `Your payment for ${itemList} failed: ${charge.failure_message || 'Unknown error'}. Your holds remain active.`,
                link: `/items/${holdInvoice.itemIds[0]}`,
                channel: 'OPERATIONAL',
              },
            });
          });

          console.log(`[hold-invoice] Payment failed for invoice ${invoiceId} (${bundledItems.length} items): ${charge.failure_message}`);
        }
      }
      break;
    }
    default:
      console.warn(`[stripe] Unhandled event type: ${event.type}`);
  }

  try {
    await prisma.processedWebhookEvent.create({
      data: { eventId: event.id }
    });
  } catch (err) {
    console.warn(`[webhook] Failed to record processed event ${event.id}:`, err);
  }

  res.json({ received: true });
};

// Return the clientSecret for an existing PENDING purchase (used by auction winners)
export const getPendingPayment = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { purchaseId } = req.params;

    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: {
        item: { select: { title: true } },
      },
    });

    if (!purchase) {
      return res.status(404).json({ message: 'Purchase not found' });
    }

    if (purchase.userId !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (purchase.status !== 'PENDING') {
      return res.status(400).json({ message: 'Purchase is not pending payment' });
    }

    if (!purchase.stripePaymentIntentId) {
      return res.status(400).json({ message: 'No payment intent for this purchase' });
    }

    const paymentIntent = await stripe().paymentIntents.retrieve(purchase.stripePaymentIntentId);

    const amount = purchase.amount;
    const platformFee = purchase.platformFeeAmount ?? 0;

    res.json({
      clientSecret: paymentIntent.client_secret,
      totalAmount: amount,
      platformFee,
      itemTitle: purchase.item?.title ?? 'Item',
    });
  } catch (error) {
    console.error('getPendingPayment error:', error);
    res.status(500).json({ message: 'Failed to retrieve payment details' });
  }
};

// Issue a refund (organizer or admin only)
export const createRefund = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    const isAdmin = req.user?.role === 'ADMIN';
    if (!req.user || (!hasOrganizerRole && !isAdmin)) {
      return res.status(403).json({ message: 'Organizer or admin access required' });
    }

    const { purchaseId } = req.params;

    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      include: {
        sale: { include: { organizer: { select: { userId: true } } } },
      },
    });

    if (!purchase) {
      return res.status(404).json({ message: 'Purchase not found' });
    }

    if (hasOrganizerRole && purchase.sale?.organizer?.userId !== req.user.id) {
      return res.status(403).json({ message: 'You can only refund purchases from your own sales' });
    }

    if (purchase.status !== 'PAID') {
      return res.status(400).json({ message: 'Only paid purchases can be refunded' });
    }

    if (!purchase.stripePaymentIntentId) {
      return res.status(400).json({ message: 'No payment intent found for this purchase' });
    }

    await stripe().refunds.create({ payment_intent: purchase.stripePaymentIntentId });

    await prisma.purchase.update({ where: { id: purchaseId }, data: { status: 'REFUNDED' } });

    if (purchase.itemId) {
      await prisma.item.update({ where: { id: purchase.itemId }, data: { status: 'AVAILABLE' } });
    }

    res.json({ message: 'Refund issued successfully' });
  } catch (error) {
    console.error('createRefund error:', error);
    res.status(500).json({ message: 'Failed to issue refund' });
  }
};

// Create a Stripe Checkout Session for subscription upgrades (#23: Pricing page)
export const createCheckoutSession = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { priceId, successUrl, cancelUrl } = req.body;

    if (!priceId) {
      return res.status(400).json({ message: 'priceId is required' });
    }

    // Validate priceId is one of the allowed subscription prices
    const allowedPrices = [
      'price_1TDUQsLTUdEUnHOTzG6cVDwu', // PRO
      'price_1TDUQtLTUdEUnHOTCEoNL6oz', // TEAMS
    ];
    if (!allowedPrices.includes(priceId)) {
      return res.status(400).json({ message: 'Invalid price ID' });
    }

    // Build callback URLs
    const baseUrl = process.env.FRONTEND_URL || 'https://finda.sale';
    const successUri = successUrl || `${baseUrl}/organizer/dashboard?upgrade=success`;
    const cancelUri = cancelUrl || `${baseUrl}/pricing?upgrade=cancelled`;

    // Get or create Stripe customer
    let stripeCustomerId = req.user.stripeCustomerId || '';
    if (!stripeCustomerId) {
      const customer = await stripe().customers.create({
        email: req.user.email,
        name: req.user.name,
      });
      stripeCustomerId = customer.id;
      // Store customer ID in User model (if available in Prisma User)
      // For now, we'll just use it for this session
    }

    // Create Checkout Session
    const session = await stripe().checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUri,
      cancel_url: cancelUri,
      metadata: {
        userId: req.user.id,
      },
    });

    res.json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (error: unknown) {
    console.error('Stripe checkout session creation error:', error);
    let message = 'Failed to create checkout session';
    let statusCode = 500;

    if (error instanceof Error) {
      if (error.message?.includes('Invalid')) {
        statusCode = 400;
        message = 'Invalid price or customer information';
      }
    }

    res.status(statusCode).json({ message });
  }
};

// #132: À La Carte Single-Sale Fee Checkout ($9.99)
export const createAlaCarteCheckout = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { id } = req.params;

    // Verify organizer role
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!hasOrganizerRole) {
      return res.status(403).json({ message: 'Access denied. Organizer access required.' });
    }

    // Load organizer
    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
      include: { user: true },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    // SIMPLE tier only
    if (organizer.subscriptionTier !== 'SIMPLE') {
      return res.status(403).json({
        message: `À la carte pricing is only available for SIMPLE tier organizers. You are on ${organizer.subscriptionTier} tier.`,
      });
    }

    // Load and verify sale belongs to organizer
    const sale = await prisma.sale.findUnique({
      where: { id },
      select: { id: true, organizerId: true, title: true },
    });

    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    if (sale.organizerId !== organizer.id) {
      return res.status(403).json({ message: 'Access denied. This sale does not belong to you.' });
    }

    // Get or create Stripe customer
    let customerId = organizer.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe().customers.create({
        email: organizer.user.email,
        metadata: { organizerId: organizer.id },
      });
      customerId = customer.id;

      await prisma.organizer.update({
        where: { id: organizer.id },
        data: { stripeCustomerId: customerId },
      });
    }

    // Create one-time checkout for $9.99
    const session = await stripe().checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer: customerId,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `À La Carte Sale Fee - ${sale.title}`,
              description: 'One-time fee to publish this sale without a subscription',
            },
            unit_amount: 999, // $9.99 in cents
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.FRONTEND_URL || 'https://finda.sale'}/organizer/dashboard?ala-carte=success`,
      cancel_url: `${process.env.FRONTEND_URL || 'https://finda.sale'}/organizer/dashboard`,
      metadata: {
        saleId: id,
        type: 'ALA_CARTE',
      },
    });

    if (!session.url) {
      return res.status(500).json({ message: 'Failed to create checkout session' });
    }

    res.json({ url: session.url });
  } catch (error: unknown) {
    console.error('À la carte checkout error:', error);
    res.status(500).json({ message: 'Failed to create checkout session' });
  }
};
