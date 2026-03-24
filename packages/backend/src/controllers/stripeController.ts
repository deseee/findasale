import { Request, Response } from 'express';
import { getStripe } from '../utils/stripe';
import { AuthRequest } from '../middleware/auth';
import { Resend } from 'resend';
import { handlePurchaseBadge } from './userController';
import { awardPoints } from '../services/pointsService';
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
  item: { title: string } | null;
  sale: { title: string } | null;
}) => {
  const resend = getResendClient();
  if (!resend) return;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'receipts@finda.sale';
  const historyUrl = `${process.env.FRONTEND_URL || 'https://finda.sale'}/shopper/purchases`;
  try {
    const html = buildEmail({
      preheader: `Receipt for ${purchase.item?.title ?? 'your purchase'}`,
      headline: 'Your purchase is confirmed! 🎉',
      body: `<p>Hi ${purchase.user.name},</p><p>Your payment of <strong>$${purchase.amount.toFixed(2)}</strong> for <strong>${purchase.item?.title ?? 'an item'}</strong> from <em>${purchase.sale?.title ?? 'a sale'}</em> has been confirmed.</p><p>Thank you for your purchase! The organizer will be in touch about pickup.</p>`,
      ctaText: 'View Purchase History',
      ctaUrl: historyUrl,
      accentColor: '#10b981',
    });

    await resend.emails.send({
      from: fromEmail,
      to: purchase.user.email,
      subject: `Receipt: ${purchase.item?.title ?? 'Your purchase'}`,
      html,
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

    const isAuctionItem = !!item.auctionStartPrice;
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
    const platformFeeAmount = Math.round(priceCents * feePercent);

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
    const finalPriceCents = priceCents - discountAmount;

    const couponSuffix = couponId ? `-c${couponId.slice(-6)}` : '';
    const idempotencyKey = `pi-${itemId}-${req.user.id}${couponSuffix}`;

    const paymentIntent = await stripe().paymentIntents.create(
      {
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
        application_fee_amount: platformFeeAmount,
        on_behalf_of: item.sale.organizer.stripeConnectId,
        transfer_data: {
          destination: item.sale.organizer.stripeConnectId,
        },
      },
      { idempotencyKey }
    );

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

    res.json({
      clientSecret: paymentIntent.client_secret,
      purchaseId: purchase.id,
      platformFee: platformFeeAmount / 100,
      totalAmount: finalPriceCents / 100,
      originalAmount: price,
      discountApplied: discountAmount / 100,
      ...(couponCode ? { couponCode } : {}),
    });
  } catch (error: unknown) {
    console.error('Payment Intent creation error:', error);
    res.status(500).json({ message: 'Failed to create payment intent' });
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
          user: { select: { email: true, name: true } },
          item: { select: { title: true } },
          sale: {
            select: {
              title: true,
              organizer: { select: { stripeConnectId: true, userId: true } },
            },
          },
        },
      });

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

        // Award XP to shopper for completing purchase
        awardXp(purchase.userId, 'PURCHASE_COMPLETED', XP_AWARDS.PURCHASE, {
          itemId: purchase.itemId,
          saleId: purchase.saleId
        }).catch(err =>
          console.error('[XP] Failed to award XP for purchase completed:', err)
        );

        // Notify organizer of payment received
        if (purchase.sale?.organizer?.userId) {
          createNotification({
            userId: purchase.sale.organizer.userId,
            type: 'payment_received',
            title: 'Payment received',
            body: `Payment of $${(paymentIntent.amount_received / 100).toFixed(2)} received for "${purchase.item?.title || 'item'}"`,
            link: `/organizer/sales/${purchase.saleId}`,
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
          await handlePurchaseBadge(purchase.userId);

          checkAndAward(purchase.userId, 'PURCHASE_MADE')
            .catch(err => console.warn('[achievement] Failed to award purchase achievement:', err));

          awardPoints(
            purchase.userId,
            'PURCHASE',
            10,
            purchase.saleId ?? undefined,
            paymentIntent.metadata?.itemId,
            'Purchased an item',
          ).catch(err => console.warn('[points] Failed to award purchase points:', err));

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
            link: '/shopper/purchases'
          }).catch(err => console.error('[notification] Failed to create purchase notification:', err));
        }

        if (!isPOS && purchase.user) {
          await sendReceiptEmail({
            id: purchase.id,
            amount: purchase.amount,
            user: { email: purchase.user.email, name: purchase.user.name },
            item: purchase.item,
            sale: purchase.sale,
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
            include: { item: { include: { sale: true } } }
          });
          if (purchase && purchase.item?.sale) {
            await prisma.purchase.update({
              where: { id: purchase.id },
              data: { status: 'DISPUTED' }
            });
            console.log(`[stripe] Purchase marked DISPUTED: purchase_id=${purchase.id}, dispute_id=${dispute.id}`);

            // Feature #107: Record chargeback incident in fraud tracking
            const { recordChargebackIncident } = await import('../services/fraudService');
            await recordChargebackIncident(
              purchase.item.sale.organizerId,
              purchase.id,
              dispute.id
            );
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
        include: { user: { select: { email: true, name: true } } }
      });

      if (!organizer) {
        console.warn(`[webhook] Subscription deleted for unknown customer ${customerId}`);
        break;
      }

      // Downgrade to SIMPLE
      await prisma.organizer.update({
        where: { id: organizer.id },
        data: {
          subscriptionTier: 'SIMPLE',
          subscriptionStatus: 'canceled',
          stripeSubscriptionId: null,
          tokenVersion: organizer.tokenVersion + 1, // Invalidate stale JWT tier claims
        }
      });

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
        where: { stripeCustomerId: customerId }
      });

      if (!organizer) {
        console.warn(`[webhook] Subscription updated for unknown customer ${customerId}`);
        break;
      }

      // If resuming from past_due, update tier
      if (organizer.subscriptionStatus === 'past_due') {
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
