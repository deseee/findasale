import { Request, Response } from 'express';
import crypto from 'crypto';
import Stripe from 'stripe';
import * as Sentry from '@sentry/node';
import { getStripe, getTestStripe } from '../utils/stripe';
import { AuthRequest } from '../middleware/auth';
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
import { awardXp, applyHuntPassMultiplier, XP_AWARDS, markHuntPassCancellation } from '../services/xpService'; // Explorer's Guild XP awards
import { checkAndAwardOgBuyer } from '../services/badgeService'; // Feature #404: OG Buyer badge
import { referralTrancheService } from '../services/referralTrancheService'; // Feature: Referral tranche system
import { awardOrganizerClaimedXp, awardProUpgradeXp } from '../services/referralService'; // Organizer referral XP
import { processTierLapse, recordTierResumption } from '../services/tierLapseService'; // Feature #75: Tier lapse logic
import { evaluateReferralFraud, getAccountAgeDays, MIN_ACCOUNT_AGE_DAYS } from '../services/referralFraudService'; // D-XP-004: Referral Fraud Gate
import { getClientIp } from '../utils/getClientIp'; // Platform Safety #94, #98: Client IP tracking
import { checkPaymentDuplicate, storePaymentFingerprint, logPaymentDuplicateWarning } from '../services/paymentDeduplicationService'; // Platform Safety #102
import { getPlatformFeeRate, SubscriptionTier } from '../utils/feeCalculator'; // S388: Tier-aware fee calculation
import { endEbayListingIfExists } from './ebayController'; // Feature #244 Phase 2: eBay direct push — withdraw on sale
import { notifyFacebookExportedItemSold } from '../services/facebookNudgeService';
import { markShopifyItemSold } from '../services/shopifyService'; // Feature: Shopify Cross-Listing
import { sellItemUnits, InsufficientStockError } from '../services/itemStockService'; // ADR-085 Track B Phase 1 Step 4
import { syncMarketplaceStock } from '../services/marketplaceStockSyncService'; // ADR-087 Phase 4: revise-on-partial eBay quantity sync
import { sendConsignorItemSold } from '../services/consignorEmailService'; // Feature #309: Consignor email notifications
import { executeVerifiedRefund, RefundError, sendRefundConfirmationEmail, disputeClawbackEnabled } from '../services/refundService'; // P1 fix (2026-07-29): shared refund execution (see refundService.ts) + dispute-triggered refund confirmation. applyFirstMonthRefundCap/logRefundProcessing no longer used here — see the cap-removal comment at this file's createRefund call site.
import { transactionalEmailService } from '../lib/transactionalEmailService';
import { assertCheckoutAllowed, assertGuestCheckoutAllowed, recordConfirmedSignal, CheckoutGuardError } from '../services/checkoutGuard'; // S1072 Finding #4: collusion/wash-trade guard
import { recordPosPaymentLinkSale } from '../services/posPaymentLinkRecorder'; // ADR pos-webhook-idempotency-reconciliation (2026-07-23, S1151)
import { markHoldInvoicePaid } from '../services/holdInvoicePaymentRecorder'; // payments fix (2026-08-03): shared HoldInvoice-PAID recorder, webhook + reconcile
import { settleHubOwnerReversalForLeg } from './vendorBoothCartController'; // P1 (2026-07-28): durable hub-owner Transfer reversal settlement
import { shouldUseDirectCharge } from '../services/stripeConnectService'; // Direct-charges migration (2026-08-08): staged-rollout routing decision
import { notifyVendorBoothSaleRefunded } from '../services/vendorBoothSaleNotificationService'; // tell the vendor their booth sale was refunded

// Lazy — avoids crash when module loads before dotenv runs
const stripe = () => getStripe();

/**
 * P1 money-path fix (2026-07-28) — DESTINATION-charge refund clawback.
 *
 * createPaymentIntent (see `shouldUseConnect` / `transfer_data: { destination: ... }` below)
 * creates DESTINATION charges: the charge lives on the PLATFORM account and carries
 * `application_fee_amount`. Two separate money movements happen at capture, and knowing
 * WHICH is what makes the flags below non-obvious. Verbatim from stripe@14.25.0:
 *   types/Charges.d.ts:2041 (Charge.TransferData.amount) — "The amount transferred to the
 *       destination account, if specified. BY DEFAULT, THE ENTIRE CHARGE AMOUNT IS
 *       TRANSFERRED TO THE DESTINATION ACCOUNT."  <-- we never set transfer_data.amount, so
 *       the FULL gross is Transferred, not gross-minus-fee.
 *   types/ApplicationFees.d.ts:22 (ApplicationFee.account) — "ID of the Stripe account this
 *       fee was TAKEN FROM."  <-- the fee is pulled back off the CONNECTED account.
 *   types/TransferReversals.d.ts:8-9 — "Transfer reversals add to the platform's balance and
 *       subtract from the destination account's balance."
 *
 * So on a $100.00 sale at an 8% platform fee (charge 10000c, application_fee_amount 800c):
 *   capture: platform +10000 -10000 (Transfer) +800 (fee) = +800
 *            organizer +10000 -800 = +9200
 *
 * A plain refunds.create refunds the buyer out of the PLATFORM balance and — because both
 * flags below are optional and DEFAULT TO FALSE — reverses neither the Transfer nor the fee:
 *   full refund, flags off: platform 800 -10000 = -9200; organizer KEEPS +9200; buyer 0.
 * The organizer is paid in full for a sale that was cancelled or never validly completed.
 *
 * The two flags must be set TOGETHER. Verbatim from types/RefundsResource.d.ts:
 *   :54 refund_application_fee — "Boolean indicating whether the application fee should be
 *       refunded when refunding this charge. If a full charge refund is given, the full
 *       application fee will be refunded. Otherwise, the application fee will be refunded in
 *       an amount proportional to the amount of the charge refunded. An application fee can
 *       be refunded only by the application that created the charge."
 *   :59 reverse_transfer — "Boolean indicating whether the transfer should be reversed when
 *       refunding this charge. The transfer will be reversed proportionally to the amount
 *       being refunded (either the entire or partial amount)."
 *
 * Full refund of the $100 charge above, all four combinations, in cents:
 *   neither          platform  800 -10000                 = -9200 | organizer +9200 | BAD
 *   fee only         platform  800 -10000        -800     = -10000| organizer +10000| WORSE
 *   transfer only    platform  800 -10000 +10000          =  +800 | organizer  -800 | WRONG
 *   BOTH (this fix)  platform  800 -10000 +10000 -800     =     0 | organizer     0 | RIGHT
 * refund_application_fee ALONE MAKES THE LOSS WORSE — it hands the platform's $8 back to the
 * connected account while the $100 Transfer stays put. reverse_transfer ALONE drives the
 * organizer $8 NEGATIVE and lets the platform keep a fee on a refunded sale. Only both
 * together return every party to zero.
 *
 * Both flags are PROPORTIONAL on partial refunds against the same denominator
 * (refunded amount / charge amount), so partials net out identically. A $40.00 partial on
 * the same charge (4000c = 40%): reversal 4000c, fee refund 320c ->
 *   platform 800 -4000 +4000 -320 = +480 (8% of the $60 kept)
 *   organizer 9200 -4000 +320     = +5520 (92% of the $60 kept)   sum 6000 = buyer's net.
 * Without the flags the same partial leaves platform at -3200 and organizer at +9200.
 *
 * Balance risk: TransferReversals.d.ts:14-16 conditions "the destination account has enough
 * balance" ONLY on transfer_group (separate charges and transfers) reversals — destination
 * charge reversals are "allowed ... up to the amount of the charge" (:11-13) and may take a
 * connected account negative. That is intended for Part A (fraud / never-completed sales)
 * and is exactly why Part B is gated behind organizer notice.
 *
 * GUARD — why this is a predicate and not an unconditional flag: not every PaymentIntent
 * reaching the webhook is a destination charge. `shouldUseConnect` is false when the
 * organizer has no stripeConnectId or a seeded `acct_test_` one, and those PaymentIntents
 * are created with NO transfer_data and NO application fee. There is then nothing to reverse
 * and no fee to refund, so skipping the flags is the correct behaviour — and it also avoids
 * asking Stripe to reverse a Transfer that does not exist, which we cannot safely exercise
 * against the live API from here.
 */
const isDestinationCharge = (pi: Stripe.PaymentIntent): boolean =>
  !!pi.transfer_data?.destination;

// PART B GATE (2026-07-28) / refundClawbackEnabled() — MOVED to services/refundService.ts
// 2026-07-29 as part of the executeVerifiedRefund extraction. Do not re-add a local copy
// here; see refundService.ts for the full money-path rationale and the DEFAULT-OFF flag.

/**
 * Dispute clawback (2026-08-08) — shared resolver for charge.dispute.* webhook cases.
 *
 * Given a Dispute object and the webhook event's optional connected-account id
 * (`event.account`, present when the event was signed with STRIPE_CONNECT_WEBHOOK_SECRET —
 * i.e. a Direct-charge / booth-cart dispute — absent for a platform/destination-charge
 * dispute), resolves { charge, paymentIntent, purchase }.
 *
 * Fixes a pre-existing gap in the original charge.dispute.created handler (confirmed via
 * code read, 2026-08-08): its inline charges.retrieve(chargeId) call never passed
 * { stripeAccount }, so a Direct-charge (booth-cart) dispute's retrieve fails against the
 * platform account (that charge doesn't exist there) and falls into the outer catch with
 * ZERO processing — no DISPUTED status, no chargebackCount increment, no organizer/vendor
 * notification. See the same-named fix applied inline to charge.dispute.created below.
 */
const resolveDisputeContext = async (
  dispute: Stripe.Dispute,
  connectedAccountId: string | undefined
) => {
  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge.id;
  const retrieveOpts = connectedAccountId ? { stripeAccount: connectedAccountId } : undefined;
  const charge = await stripe().charges.retrieve(chargeId, retrieveOpts);
  const paymentIntentId = typeof charge.payment_intent === 'string'
    ? charge.payment_intent
    : charge.payment_intent?.id ?? null;
  if (!paymentIntentId) {
    return { charge, paymentIntent: null, purchase: null };
  }
  const paymentIntent = await stripe().paymentIntents.retrieve(paymentIntentId, retrieveOpts);
  const purchase = await prisma.purchase.findFirst({
    where: { stripePaymentIntentId: paymentIntentId },
    include: { item: { include: { sale: { include: { organizer: { select: { id: true, userId: true } } } } } }, user: true },
  });
  return { charge, paymentIntent, purchase };
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
  
  const fromEmail = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';
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
      ? ` (${new Date(purchase.sale!.startDate).toLocaleDateString()} - ${new Date(purchase.sale!.endDate).toLocaleDateString()})`
      : '';

    const organizerName = purchase.sale?.organizer?.businessName ? `<p style="margin-top: 12px; color: #6b7280; font-size: 14px;">Organized by: <strong>${purchase.sale!.organizer.businessName}</strong></p>` : '';

    const html = buildEmail({
      preheader: `Receipt for ${purchase.item?.title ?? 'your purchase'} - Transaction ID: ${purchase.id.slice(0, 8)}`,
      headline: 'Your purchase is confirmed! 🎉',
      body: `<p>Hi ${purchase.user.name},</p><p>Your payment for <strong>${purchase.item?.title ?? 'an item'}</strong> from <em>${purchase.sale?.title ?? 'a sale'}${saleDate}</em> has been confirmed.</p>${itemPhotoHtml}${breakdownHtml}<p style="margin-top: 24px; font-size: 14px; color: #6b7280;"><strong>Transaction ID:</strong> ${purchase.id}</p>${organizerName}<p style="margin-top: 24px; font-size: 14px;">Thank you for your purchase! The organizer will be in touch about pickup.</p><p style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af;">This receipt serves as your purchase confirmation and acknowledgment of the buyer premium. For disputes, reference your transaction ID and contact support@finda.sale</p>`,
      ctaText: 'View Purchase History',
      ctaUrl: historyUrl,
      accentColor: '#10b981',
    });

    await transactionalEmailService.emails.send({
      from: fromEmail,
      to: purchase.user.email,
      subject: `Receipt: ${purchase.item?.title ?? 'Your purchase'} - Transaction ID: ${purchase.id.slice(0, 8)}`,
      html,
    });

    // Update CheckoutEvidence to track when confirmation email was sent
    await prisma.checkoutEvidence.updateMany({
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

    // SECURITY FIX P1: Validate organizer ownership before associating Stripe Connect account
    // Prevent account takeover by ensuring only the organizer's own user can associate Connect accounts
    if (organizer.userId !== req.user.id) {
      console.warn(`[SECURITY] Unauthorized Stripe Connect attempt: userId=${req.user.id} attempted to access organizerId=${organizer.id}`);
      return res.status(403).json({ message: 'Forbidden. You do not have permission to modify this organizer.' });
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
        // Invalid / inaccessible account ID (e.g. seed data like 'acct_test_user3').
        // Clear it and fall through to create a real account below.
        const isInvalidAccount =
          loginError.message?.includes('does not have access') ||
          loginError.message?.includes('does not exist') ||
          loginError.code === 'account_invalid' ||
          loginError.type === 'invalid_request_error';
        if (!isInvalidAccount) throw loginError;
        // SECURITY: Log when clearing invalid Stripe Connect account
        console.warn(`[SECURITY] Invalid Stripe Connect account cleared: organizerId=${organizer.id} oldConnectId=${organizer.stripeConnectId} by userId=${req.user!.id} at ${new Date().toISOString()}`);
        await prisma.organizer.update({
          where: { userId: req.user!.id },
          data: { stripeConnectId: null },
        });
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

    // SECURITY: Audit log for Stripe Connect account association
    console.log(`[SECURITY] Stripe Connect account linked: organizerId=${organizer.id} connectId=${account.id} by userId=${req.user.id} at ${new Date().toISOString()}`);
    console.info(`[billing] Stripe Connect account created for organizer ${organizer.id}`);

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

    const existingPurchase = await prisma.purchase.findFirst({
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

      // ADR-085 Track B Phase 1 Step 4: atomic, race-safe stock decrement replaces the old
      // unconditional status update. The live-feed socket push below only makes sense once
      // the item is actually fully sold out, so it's now gated on that instead of on a bare
      // successful update.
      let updatedItem: { id: string; saleId: string | null; title: string; price: number | null } | null = null;
      let recoveryFullySoldOut: boolean | undefined;
      let recoveryRemainingStock: number | undefined;
      try {
        ({ fullySoldOut: recoveryFullySoldOut, remainingStock: recoveryRemainingStock } = await sellItemUnits(itemId, 1));
        if (recoveryFullySoldOut) {
          updatedItem = await prisma.item.findUnique({
            where: { id: itemId },
            select: { id: true, saleId: true, title: true, price: true },
          });
        }
      } catch (err) {
        if (err instanceof InsufficientStockError) {
          console.warn('Item already fully sold during recovery (not an error):', err.message);
        } else {
          console.warn('Failed to update item status during recovery:', err);
        }
      }

      // ADR-087 Phase 4: partial sale (item not fully sold out) — revise the
      // eBay listing's remaining quantity if the item is eBay-linked. Fire-and-
      // forget, mirrors the fullySoldOut withdraw hook's shape exactly.
      if (recoveryFullySoldOut === false && recoveryRemainingStock !== undefined) {
        syncMarketplaceStock(itemId, { fullySoldOut: false, remainingStock: recoveryRemainingStock }).catch(err =>
          console.error('[eBay ReviseQty] sync failed for item', itemId, err)
        );
      }

      if (updatedItem) {
        try {
          const io = getIO();
          pushEvent(io, updatedItem.saleId ?? '', {
            type: 'SOLD',
            itemTitle: updatedItem.title,
            amount: updatedItem.price || undefined,
            saleId: updatedItem.saleId ?? '',
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
    // Guest checkout (single-item Buy It Now, 2026-07-18): req.user is optional now that
    // this route uses optionalAuthenticate. createCartCheckoutSession (multi-item cart) is
    // UNCHANGED and still requires auth — guest cart checkout is out of scope this pass.
    const { itemId, affiliateLinkId, shippingRequested, couponCode, guestEmail, guestName, deviceFingerprint, clientToken } = req.body;

    if (!itemId) {
      return res.status(400).json({ message: 'Item ID is required' });
    }

    // Guests must provide contact info up front — there is no User row to email a receipt to.
    let normalizedGuestEmail: string | null = null;
    let normalizedGuestName: string | null = null;
    if (!req.user) {
      if (!guestEmail || typeof guestEmail !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim())) {
        return res.status(400).json({ message: 'A valid email is required to check out as a guest.' });
      }
      if (!guestName || typeof guestName !== 'string' || !guestName.trim()) {
        return res.status(400).json({ message: 'Your name is required to check out as a guest.' });
      }
      normalizedGuestEmail = guestEmail.trim().toLowerCase();
      normalizedGuestName = guestName.trim().slice(0, 200);
      // Basic per-email guest-checkout-attempt logging (Hacker P1 #4) — paymentLimiter
      // (5 req/min, IP+user keyed via getKeyGenerator) already rate-limits this route;
      // this is a cheap additional audit trail, not new infra.
      console.log(`[guest-checkout] attempt itemId=${itemId} email=${normalizedGuestEmail}`);
    }

    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: {
        sale: {
          select: {
            id: true,
            status: true, // Security: gate purchases to PUBLISHED sales only
            isAuctionSale: true,
            saleType: true,
            saleSubtype: true,
            isCharitySale: true,
            title: true,
            address: true,
            city: true,
            state: true,
            startDate: true,
            endDate: true,
            organizerId: true,
            coversFee: true, // #402: organizer absorbs platform fee
            organizer: {
              select: { stripeConnectId: true, userId: true, referralDiscountExpiry: true, subscriptionTier: true }
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

    if (!item.sale!.organizer.stripeConnectId) {
      return res.status(400).json({ message: 'Organizer has not set up payment processing' });
    }

    // Security: block purchases against non-published (DRAFT/ENDED) sales
    if (item.sale!.status !== 'PUBLISHED') {
      return res.status(403).json({ message: 'This sale is not currently available for purchase.' });
    }

    // S1072 Finding #4: collusion/wash-trade guard — identity-grade device/card fingerprint match.
    // Guests have no User row (no stored fingerprints for assertCheckoutAllowed to read) — run
    // the guest-specific pre-payment guard instead (device fingerprint only; card fingerprint
    // isn't known yet at PaymentIntent-creation time, so guest card-fingerprint self-dealing +
    // cross-purchase collusion checks run post-payment in the webhook — see payment_intent.succeeded).
    try {
      if (req.user) {
        await assertCheckoutAllowed({
          buyerUserId: req.user.id,
          saleId: item.sale!.id,
          itemId: item.id,
          prisma,
          context: 'createPaymentIntent',
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
          context: 'createPaymentIntent-guest',
        });
      }
    } catch (guardError) {
      if (guardError instanceof CheckoutGuardError) {
        return res.status(403).json({ message: guardError.message });
      }
      throw guardError;
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
    const baseFeePercent = feeStructure?.feeRate ?? getPlatformFeeRate(item.sale!.organizer.subscriptionTier as any);

    const discountExpiry = item.sale!.organizer.referralDiscountExpiry;
    const hasReferralDiscount = discountExpiry != null && discountExpiry > new Date();
    const feePercent = hasReferralDiscount ? 0 : baseFeePercent;

    const priceCents = Math.round((price + shippingCost) * 100);
    // For regular items: fee is taken from organizer payout (application_fee_amount only), buyer sees item price + shipping only
    // For auction items: buyer pays winning bid + 5% premium; 5% is taken as application_fee_amount
    const totalWithBuyerPremium = priceCents + buyerPremiumAmount;
    const platformFeeAmount = isAuctionItem
      ? buyerPremiumAmount  // Auction: 5% buyer premium = application_fee
      : Math.round(priceCents * feePercent);  // Regular: 10% platform fee on item + shipping

    // D-XP-003: Organizer discount takes priority (no stacking with shopper XP coupon)
    let organizerDiscountActive = false;
    let discountAmount = 0;
    let couponId: string | undefined;

    // Check if organizer discount is active
    if (item.organizerDiscountAmount && parseFloat(item.organizerDiscountAmount.toString()) > 0) {
      // Organizer discount active — block shopper coupon
      organizerDiscountActive = true;
      discountAmount = Math.round(parseFloat(item.organizerDiscountAmount.toString()) * 100);
      discountAmount = Math.min(discountAmount, priceCents - 50); // Ensure price doesn't go below $0.50
    } else if (couponCode && !req.user) {
      // Coupons are earned per-account (XP rewards) — a guest can never have one.
      return res.status(400).json({ message: 'Coupon codes require a FindA.Sale account. Sign in to use a coupon, or continue as a guest without one.' });
    } else if (couponCode) {
      // Organizer discount not active — allow shopper coupon
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
    // #402: Cover the Fee — when organizer absorbs fee, buyer pays item price only
    const saleCoversFee = !isAuctionItem ? false : (item.sale as any)?.coversFee === true;
    const finalPriceCents = isAuctionItem
      ? saleCoversFee
        ? priceCents - discountAmount                                // Auction + coversFee: buyer pays bid only; organizer absorbs buyer premium
        : totalWithBuyerPremium + platformFeeAmount - discountAmount // Auction normal: item + premium - discount
      : totalWithBuyerPremium - discountAmount;                      // Regular: item + shipping - discount only (platform fee from organizer payout)

    const couponSuffix = couponId ? `-c${couponId.slice(-6)}` : '';
    // Guest idempotency fix (2026-08-04): the frontend (CheckoutModal.tsx) now generates a
    // stable clientToken ONCE per modal mount and resends it on every create-payment-intent
    // call for that same checkout session, so a genuine retry (double-click, network retry)
    // dedupes to the SAME Stripe idempotency key -> SAME PaymentIntent -> the findFirst guard
    // below reuses the existing PENDING Purchase row instead of inserting a new one. Falls
    // back to the old random-suffix (never dedupes) behavior if an older/unpatched client
    // omits clientToken -- known limitation preserved only for that edge case.
    const guestIdempotencySuffix = clientToken && typeof clientToken === 'string' && clientToken.trim()
      ? clientToken.trim().slice(0, 100)
      : crypto.randomUUID();
    const idempotencyKey = req.user
      ? `pi-${itemId}-${req.user.id}${couponSuffix}`
      : `pi-${itemId}-guest-${guestIdempotencySuffix}${couponSuffix}`;

    let paymentIntent;
    const stripeConnectId = item.sale!.organizer.stripeConnectId;
    const shouldUseConnect = stripeConnectId && !stripeConnectId.startsWith('acct_test_');
    // Direct-charges migration (2026-08-08): staged-rollout routing decision — live Stripe
    // eligibility check + allowlist gate, see stripeConnectService.shouldUseDirectCharge.
    const useDirect = shouldUseConnect
      ? await shouldUseDirectCharge(item.sale!.organizerId, stripeConnectId)
      : false;

    const basePaymentIntentData = {
      amount: finalPriceCents,
      currency: 'usd',
      // Tax collection intentionally OFF (Patrick decision S1006 — don't collect until
      // FindA.Sale must register in nexus states). Also: Stripe rejects automatic_tax on
      // raw PaymentIntents ("Received unknown parameter: automatic_tax") regardless.
      metadata: {
        itemId: item.id,
        saleId: item.sale!.id,
        ...(req.user ? { userId: req.user.id } : { guestCheckout: 'true' }),
        ...(affiliateLinkId ? { affiliateLinkId } : {}),
        ...(shippingCost > 0 ? { shippingCost: String(shippingCost) } : {}),
        ...(couponId ? { couponId } : {}),
        ...(organizerDiscountActive ? { isOrganizerDiscountActive: 'true' } : {}),
      },
    };

    // Direct-charges migration (2026-08-08): a Direct charge lives on the connected account
    // itself — drop on_behalf_of/transfer_data (there is no platform-side Transfer) and keep
    // application_fee_amount; the { stripeAccount } request option below routes the create
    // call to the connected account. Destination-charge shape (else branch) is UNCHANGED.
    const paymentIntentCreateParams = useDirect
      ? {
          ...basePaymentIntentData,
          application_fee_amount: platformFeeAmount,
        }
      : shouldUseConnect
        ? {
            ...basePaymentIntentData,
            application_fee_amount: platformFeeAmount,
            on_behalf_of: stripeConnectId,
            transfer_data: { destination: stripeConnectId },
          }
        : basePaymentIntentData;

    const paymentIntentCreateOptions = useDirect
      ? { idempotencyKey, stripeAccount: stripeConnectId! }
      : { idempotencyKey };

    try {
      // First attempt: with Connect routing if organizer has valid account
      paymentIntent = await stripe().paymentIntents.create(
        paymentIntentCreateParams,
        paymentIntentCreateOptions
      );
    } catch (stripeError: any) {
      // S1006: Connect routing failed. If the SELLER's connected account can't receive
      // funds (missing / invalid / not-onboarded), do NOT capture the buyer's money into
      // the platform account — block cleanly with a friendly, specific message (the
      // frontend now renders it). Preserves seller payout integrity and replaces the old
      // silent platform-capture fallback. Valid accounts never reach this branch.
      const stripeCode = stripeError?.code;
      const stripeMsg = typeof stripeError?.message === 'string' ? stripeError.message : '';
      const sellerAccountUnusable =
        shouldUseConnect &&
        (['insufficient_capabilities_for_transfer', 'account_invalid', 'account_closed'].includes(stripeCode) ||
          stripeMsg.includes('No such destination') ||
          stripeMsg.includes('No such account') ||
          stripeMsg.includes('does not have the necessary capabilities') ||
          stripeMsg.includes('insufficient_capabilities_for_transfer'));
      if (sellerAccountUnusable) {
        console.warn(
          `[Stripe Connect] Seller account ${stripeConnectId} cannot receive funds (${stripeCode || stripeMsg}); blocking checkout with friendly message`
        );
        return res.status(409).json({
          message: "This seller isn't set up to accept online payments yet. Please contact the organizer to arrange your purchase.",
          code: 'SELLER_PAYMENTS_UNAVAILABLE',
        });
      }
      throw stripeError;
    }

    // BUG 1 fix: the Stripe idempotencyKey (pi-${itemId}-${userId}${couponSuffix}) makes a
    // duplicate createPaymentIntent call return the SAME PaymentIntent. Guard the Purchase
    // create so a second call reuses the existing row instead of inserting a duplicate
    // PENDING row (the webhook then flips both to PAID -> double Purchase). Defense-in-depth
    // partial unique index on stripePaymentIntentId (WHERE NOT NULL) backs this at the DB level
    // (migration 20260707120000_purchase_pi_partial_unique).
    let purchase = await prisma.purchase.findFirst({
      where: { stripePaymentIntentId: paymentIntent.id },
    });

    if (!purchase) {
      purchase = await prisma.purchase.create({
        data: {
          userId: req.user?.id ?? null,
          itemId: item.id,
          saleId: item.sale!.id,
          amount: finalPriceCents / 100,
          platformFeeAmount: platformFeeAmount / 100,
          stripePaymentIntentId: paymentIntent.id,
          status: 'PENDING',
          // Direct-charges migration (2026-08-08): persisted, authoritative charge shape,
          // set once here at charge-creation time.
          chargeType: useDirect ? 'DIRECT' : 'DESTINATION',
          ...(useDirect ? { stripeAccountId: stripeConnectId! } : {}),
          ...(affiliateLinkId ? { affiliateLinkId } : {}),
          ...(normalizedGuestEmail ? { buyerEmail: normalizedGuestEmail, guestName: normalizedGuestName } : {}),
        }
      });

      // CheckoutAttempt.userId is a required FK — guests have no User row, so
      // cart-abandonment recovery tracking is skipped for guest checkouts (known gap,
      // flagged in Dev Handoff Blocked/Flagged).
      if (req.user) {
        await prisma.checkoutAttempt.upsert({
          where: { paymentIntent: paymentIntent.id },
          create: {
            userId: req.user.id,
            itemId: item.id,
            paymentIntent: paymentIntent.id,
          },
          update: {},
        }).catch(err => console.warn('[checkout-recovery] Failed to track checkout attempt:', err));
      }

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
    }

    // Format sale dates for display
    const saleStartDate = item.sale!.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const saleEndDate = item.sale!.endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
      saleName: item.sale!.title,
      saleAddress: `${item.sale!.address}, ${item.sale!.city}, ${item.sale!.state}`,
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
  const platformSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const connectSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

  if (!platformSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not configured — webhook verification cannot proceed');
    return res.status(500).send('Webhook Error: STRIPE_WEBHOOK_SECRET not configured');
  }

  let event;

  try {
    event = stripe().webhooks.constructEvent(req.body, sig, platformSecret);
  } catch (platformErr: any) {
    // POS payments are created on a connected account — their payment_intent.succeeded
    // events are signed with STRIPE_CONNECT_WEBHOOK_SECRET, not the platform secret.
    if (connectSecret) {
      try {
        event = stripe().webhooks.constructEvent(req.body, sig, connectSecret);
      } catch (connectErr: any) {
        console.error('Webhook signature verification failed (both platform and connect secrets).', connectErr.message);
        return res.status(400).send(`Webhook Error: ${connectErr.message}`);
      }
    } else {
      console.error('Webhook signature verification failed.', platformErr.message);
      return res.status(400).send(`Webhook Error: ${platformErr.message}`);
    }
  }

  // ADR pos-webhook-idempotency-reconciliation (2026-07-23, S1151): per-endpoint namespaced
  // idempotency key so /api/stripe/webhook and /api/billing/webhook cannot collide on the
  // shared ProcessedWebhookEvent table. Two-phase status (PENDING -> COMPLETED | FAILED)
  // with fail-open retry: a FAILED prior attempt no longer permanently strands the sale.
  const idempotencyKey = `stripe:${event.id}`;

  // INSERT-FIRST preserves the P0 concurrent-duplicate race guard (first inserter wins).
  try {
    await prisma.processedWebhookEvent.create({
      data: { eventId: idempotencyKey, status: 'PENDING' },
    });
  } catch (err: any) {
    if (err.code === 'P2002') {
      // Row already exists -- inspect its status to decide what to do.
      const existing = await prisma.processedWebhookEvent
        .findUnique({ where: { eventId: idempotencyKey } })
        .catch(() => null);
      if (existing?.status === 'COMPLETED') {
        console.warn(`[webhook] Duplicate event ${event.id} (type: ${event.type}) already COMPLETED -- skipping.`);
        return res.json({ received: true, duplicate: true });
      }
      if (existing?.status === 'FAILED') {
        // A prior attempt threw. Reset to PENDING and reprocess (fail-open retry).
        console.warn(`[webhook] Event ${event.id} (type: ${event.type}) previously FAILED -- reprocessing.`);
        await prisma.processedWebhookEvent
          .update({ where: { eventId: idempotencyKey }, data: { status: 'PENDING' } })
          .catch(() => {});
        // fall through to reprocess below
      } else {
        // PENDING (or unreadable) -- another delivery is in flight; do not reprocess
        // concurrently. Stripe's later retry will find COMPLETED or FAILED.
        console.warn(`[webhook] Event ${event.id} (type: ${event.type}) in-flight (PENDING) -- skipping concurrent reprocess.`);
        return res.json({ received: true, duplicate: true });
      }
    } else {
      // Other errors: log and continue (non-blocking) -- a broken idempotency check must
      // never take down real event processing.
      console.warn(`[webhook] Failed to check idempotency for event ${event.id}:`, err);
    }
  }

  // S1157-b diagnostic (2026-07-23): unconditional receipt log for EVERY webhook
  // event, regardless of type or downstream branch. Added after a second stranded-
  // sale incident (POSPaymentLink cmrxseqdp004sc635lolxkzp0, jacket item) where
  // Railway logs showed 2 webhook POSTs return 200 with ZERO application-level
  // output from either -- we could not even confirm whether checkout.session.completed
  // was among the events actually delivered, let alone which branch it took. This
  // line cannot be skipped by any downstream logic, so the next occurrence is
  // immediately diagnosable from logs alone instead of requiring cross-referencing
  // Stripe's dashboard event log by hand.
  console.log(`[webhook] Received event ${event.id} type=${event.type} livemode=${event.livemode}`);

  // ADR pos-webhook-idempotency-reconciliation (2026-07-23): wrap the ENTIRE switch so any
  // handler throw marks the idempotency row FAILED (not permanently COMPLETED) and returns
  // 500 -> Stripe retries with backoff, instead of the sale stranding forever.
  try {
  switch (event.type) {
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object;

      // Safety net: test-mode transactions must never deplete inventory
      if (!event.livemode && paymentIntent.metadata?.isTestTransaction === 'true') {
        console.log(`[test-checkout] Test PaymentIntent ${paymentIntent.id} — skipping inventory`);
        break;
      }

      // POS In-App Payment Request: check if this is a POS payment request
      if (paymentIntent.metadata?.source === 'pos_payment_request') {
        const requestId = paymentIntent.metadata.requestId;
        if (requestId) {
          try {
            // Lookup POSPaymentRequest
            const posRequest = await prisma.pOSPaymentRequest.findUnique({
              where: { id: requestId },
              include: {
                shopper: { select: { id: true, email: true, name: true } },
                // findasale-hacker fix (2026-08-09): stripeConnectId needed below to
                // correctly label the Purchase rows this webhook creates as genuine
                // Direct charges -- see the chargeType comment at the Purchase.create
                // calls below for the full rationale.
                organizer: { select: { id: true, name: true, stripeConnectId: true } },
                sale: { select: { id: true, title: true } },
              },
            });

            if (posRequest) {
              // Mark POS request as PAID
              await prisma.pOSPaymentRequest.update({
                where: { id: requestId },
                data: {
                  status: 'PAID',
                  paidAt: new Date(),
                },
              });

              // Create Purchase records for each item
              const items = await prisma.item.findMany({
                where: { id: { in: posRequest.itemIds }, saleId: posRequest.saleId },
                select: { id: true, price: true },
              });

              for (const item of items) {
                try {
                  await prisma.purchase.create({
                    data: {
                      userId: posRequest.shopperUserId,
                      itemId: item.id,
                      saleId: posRequest.saleId,
                      amount: item.price || 0,
                      platformFeeAmount: posRequest.platformFeeCents / 100,
                      // PI ID is @unique — use per-item suffix to allow multiple items per PI
                      stripePaymentIntentId: `${paymentIntent.id}_${item.id}`,
                      source: 'POS',
                      status: 'PAID',
                      // findasale-hacker fix (2026-08-09, Direct-charges adversarial pass):
                      // this webhook branch is the idempotent backstop for the SAME PaymentIntent
                      // posPaymentController.ts's confirmPaymentRequest creates via
                      // paymentIntents.create(..., { stripeAccount: organizer.stripeConnectId })
                      // -- unconditionally a genuine Direct charge (this flow predates the
                      // Direct-charges migration/allowlist). Must match confirmPaymentRequest's
                      // own Purchase.create exactly or whichever path wins the race mislabels
                      // the row and breaks refundService.ts's refund-call routing.
                      chargeType: 'DIRECT',
                      stripeAccountId: posRequest.organizer.stripeConnectId,
                    },
                  });

                  // ADR-085 Track B Phase 1 Step 4: atomic, race-safe stock decrement
                  // replaces the old unconditional status update. Downstream cross-channel
                  // removal hooks only fire once the item is actually fully sold out.
                  let itemFullySoldOut: boolean;
                  let itemRemainingStock: number;
                  try {
                    ({ fullySoldOut: itemFullySoldOut, remainingStock: itemRemainingStock } = await sellItemUnits(item.id, 1));
                  } catch (stockErr: any) {
                    if (stockErr instanceof InsufficientStockError) {
                      console.error(`[stripe] Oversold race on item ${item.id} despite captured payment:`, stockErr.message);
                    }
                    throw stockErr;
                  }

                  if (itemFullySoldOut) {
                    // Fire-and-forget: mark sold on Shopify if listed there
                    markShopifyItemSold(item.id).catch(err =>
                      console.error('[Shopify] Failed to mark item sold:', err)
                    );

                    // Fire-and-forget: end eBay listing if item was pushed there
                    endEbayListingIfExists(item.id).catch(err =>
                      console.error('[eBay] Failed to withdraw offer:', err)
                    );
                    notifyFacebookExportedItemSold(item.id).catch(err =>
                      console.warn(`[FB Nudge] failed for item ${item.id}:`, err.message)
                    );
                  } else {
                    // ADR-087 Phase 4: partial sale — revise eBay listing quantity if linked.
                    syncMarketplaceStock(item.id, { fullySoldOut: false, remainingStock: itemRemainingStock }).catch(err =>
                      console.error('[eBay ReviseQty] sync failed for item', item.id, err)
                    );
                  }

                  // Update ItemReservation if exists
                  await prisma.itemReservation.updateMany({
                    where: { itemId: item.id, userId: posRequest.shopperUserId },
                    data: { status: 'COMPLETED' },
                  });
                } catch (err: any) {
                  console.error(`[pos-payment] Failed to mark item ${item.id} as sold:`, err);
                }
              }

              // Mixed carts: create a misc Purchase for any remainder beyond catalog item prices
              // P1-2: Use integer cent math to avoid floating-point precision errors
              const realItemsTotal = items.reduce((sum: number, item: { price: number | null }) => sum + (item.price || 0), 0);
              const realItemsTotalCents = Math.round(realItemsTotal * 100);
              const miscRemainderCents = posRequest.totalAmountCents - realItemsTotalCents;
              const shouldCreateMisc = items.length === 0 || miscRemainderCents > 1;
              if (shouldCreateMisc) {
                const miscAmount = items.length === 0 ? posRequest.totalAmountCents / 100 : miscRemainderCents / 100;
                try {
                  await prisma.purchase.create({
                    data: {
                      userId: posRequest.shopperUserId,
                      itemId: null,
                      saleId: posRequest.saleId,
                      amount: miscAmount,
                      platformFeeAmount: posRequest.platformFeeCents / 100,
                      stripePaymentIntentId: items.length === 0 ? paymentIntent.id : `${paymentIntent.id}_misc`,
                      source: 'POS',
                      status: 'PAID',
                      // findasale-hacker fix (2026-08-09): same genuine-Direct-charge
                      // mislabeling gap as the item-Purchase loop above.
                      chargeType: 'DIRECT',
                      stripeAccountId: posRequest.organizer.stripeConnectId,
                    },
                  });
                } catch (err: any) {
                  console.error('[pos-payment] Failed to create misc remainder purchase:', err);
                }
              }

              // Award XP to shopper for purchase — flat 10 XP (D-XP-004)
              if (posRequest.shopperUserId) {
                try {
                  const baseXp = XP_AWARDS.PURCHASE;
                  const multipliedXp = await applyHuntPassMultiplier(posRequest.shopperUserId, baseXp);
                  awardXp(posRequest.shopperUserId, 'PURCHASE_COMPLETED', multipliedXp, {
                    saleId: posRequest.saleId,
                    preMultipliedHuntPassXp: true,
                  }).catch((err: any) =>
                    console.error('[XP] Failed to award XP for POS purchase:', err)
                  );
                } catch (err: any) {
                  console.warn('[pos-payment] Failed to award XP:', err.message);
                }
              }

              // Emit socket event to both organizer and shopper
              try {
                const io = getIO();
                io.to(`user:${posRequest.organizerUserId}`).emit('POS_PAYMENT_STATUS', {
                  type: 'POS_PAYMENT_STATUS',
                  requestId,
                  status: 'PAID',
                  totalAmountCents: posRequest.totalAmountCents,
                  paidAt: new Date().toISOString(),
                });
                io.to(`user:${posRequest.shopperUserId}`).emit('POS_PAYMENT_STATUS', {
                  type: 'POS_PAYMENT_STATUS',
                  requestId,
                  status: 'PAID',
                  totalAmountCents: posRequest.totalAmountCents,
                  paidAt: new Date().toISOString(),
                });
              } catch (err: any) {
                console.warn('[pos-payment] Failed to emit socket event:', err.message);
              }

              // Create notification to organizer
              try {
                await createNotification({
                  userId: posRequest.organizerUserId,
                  type: 'pos_payment_completed',
                  title: 'Payment Received',
                  body: `${posRequest.shopper?.name || 'Shopper'} paid $${(posRequest.totalAmountCents / 100).toFixed(2)}${posRequest.itemIds.length > 0 ? ` for ${posRequest.itemIds.length} item(s)` : ''}`,
                  link: `/organizer/pos`,
                  channel: 'OPERATIONAL',
                });
              } catch (err: any) {
                console.warn('[pos-payment] Failed to create organizer notification:', err.message);
              }

              console.log(`[pos-payment] POS payment request ${requestId} completed`);
              break; // Exit case — POS payment handled
            }
          } catch (err: any) {
            // P0 fix (2026-08-07): Stripe already captured this payment before we reach this
            // block -- if the DB work above throws (e.g. the PAID status update or Purchase
            // creation never completes), this catch previously only logged. The webhook still
            // returns 200 to Stripe (no rethrow), so Stripe never retries and the failure had
            // zero record anywhere. NOT changing retry behavior here (see push-block /
            // Blocked-Flagged note): the misc-remainder Purchase.create above (no itemId, so
            // not covered by the (stripePaymentIntentId, itemId) partial unique index) is not
            // confirmed safe to run twice on a Stripe retry, so only the alert is added.
            console.error(`[pos-payment] Failed to process POS payment request:`, err);
            try {
              Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
                tags: { area: 'pos-payment-request-webhook-fulfillment' },
                extra: {
                  requestId,
                  paymentIntentId: paymentIntent.id,
                  amountCents: paymentIntent.amount,
                  organizerId: paymentIntent.metadata?.organizerId,
                  organizerUserId: paymentIntent.metadata?.organizerUserId,
                },
              });
            } catch {
              // Sentry may not be initialized -- silently continue
            }
          }
        }
      }

      // Phase 2b: Boost Purchase — flip PENDING → ACTIVE on confirmed payment
      if (paymentIntent.metadata?.boostPurchaseId) {
        const boostPurchaseId = paymentIntent.metadata.boostPurchaseId;
        try {
          const boost = await prisma.boostPurchase.findUnique({
            where: { id: boostPurchaseId },
          });

          if (boost && boost.status === 'PENDING') {
            const now = new Date();
            const expiresAt = new Date(now);
            if (boost.durationDays === 999) {
              expiresAt.setFullYear(expiresAt.getFullYear() + 2);
            } else if (boost.durationDays <= 1) {
              expiresAt.setTime(now.getTime() + 60 * 60 * 1000); // 1-hour bump
            } else {
              expiresAt.setDate(expiresAt.getDate() + boost.durationDays);
            }

            await prisma.boostPurchase.update({
              where: { id: boostPurchaseId },
              data: {
                status: 'ACTIVE',
                activatedAt: now,
                expiresAt,
              },
            });
            console.log(`[boost-webhook] Boost ${boostPurchaseId} (${boost.boostType}) activated via Stripe`);
          }
        } catch (err) {
          console.error(`[boost-webhook] Failed to activate boost ${boostPurchaseId}:`, err);
        }
        break; // Boost handled — exit case
      }

      // Hunt Pass activation: server-side confirmation via webhook
      if (paymentIntent.metadata?.type === 'hunt_pass') {
        const userId = paymentIntent.metadata?.userId;
        if (userId) {
          try {
            const expiry = new Date();
            expiry.setDate(expiry.getDate() + 30);
            await prisma.user.update({
              where: { id: userId },
              data: {
                huntPassActive: true,
                huntPassExpiry: expiry,
                huntPassCancelledAt: null, // Clear any prior cancellation record
              },
            });
            console.log(`[hunt-pass] Activated Hunt Pass for user ${userId} via webhook, expires ${expiry.toISOString()}`);
          } catch (err) {
            console.error(`[hunt-pass] Failed to activate Hunt Pass for user ${userId}:`, err);
          }
        }
        break; // Hunt Pass handled — exit case
      }

      // Standard Purchase: handle existing purchase records
      const purchase = await prisma.purchase.findFirst({
        where: { stripePaymentIntentId: paymentIntent.id },
        include: {
          user: { select: { id: true, email: true, name: true } },
          item: { select: { title: true, photoUrls: true } },
          sale: {
            select: {
              title: true,
              startDate: true,
              endDate: true,
              zip: true, // #399: Local Legend badge — zip-based purchase count
              organizer: { select: { stripeConnectId: true, userId: true, businessName: true } },
            },
          },
        },
      });

      // Platform Safety #102: Capture and store payment method fingerprint (authenticated buyers)
      // + S1072 Finding #4 guest-checkout follow-up: guest self-dealing / cross-purchase
      // collusion detection (Hacker P0 #1, #2 — assertCheckoutAllowed can't run pre-payment
      // for a guest since there's no User row to read stored fingerprints off of; this is the
      // post-payment equivalent, gated to run BEFORE the item is marked SOLD below).
      let guestFraudBlocked = false;
      if (purchase && paymentIntent.payment_method) {
        try {
          const paymentMethod = await stripe().paymentMethods.retrieve(paymentIntent.payment_method as string);
          const cardFp = paymentMethod.card?.fingerprint;

          if (cardFp) {
            // Persist on every purchase (guest AND authenticated) — this is what makes the
            // cross-purchase collusion query below able to see guest rows, which the existing
            // pre-payment checkoutGuard.ts check (User-relation-based) structurally cannot.
            await prisma.purchase.updateMany({
              where: { stripePaymentIntentId: paymentIntent.id },
              data: { buyerCardFingerprint: cardFp },
            }).catch(err => console.warn('[stripe] Failed to persist buyerCardFingerprint:', err));

            if (purchase.userId && purchase.user?.id) {
              // Existing authenticated-buyer flow — unchanged.
              const { isDuplicate, otherUserIds } = await checkPaymentDuplicate(cardFp, purchase.user.id);
              if (isDuplicate && otherUserIds.length > 0) {
                logPaymentDuplicateWarning(purchase.user.id, cardFp, otherUserIds);
                // CRITICAL FIX: Flag account for fraud review when shared card detected
                await prisma.user.update({
                  where: { id: purchase.user.id },
                  data: { fraudSuspect: true }
                });
                console.warn(`[stripe] Fraud flag set for user ${purchase.user.id} — shared card fingerprint with users: ${otherUserIds.join(', ')}`);
              }
              // Store fingerprint on user account
              await storePaymentFingerprint(purchase.user.id, cardFp);
            }

            // Guest self-dealing check (P0 #1): guest card fingerprint === sale organizer's
            // stored card fingerprint. Only meaningful for guest purchases — an authenticated
            // buyer's self-dealing is already blocked pre-payment by assertCheckoutAllowed.
            // purchase.sale.organizer.userId is already selected by the outer query above —
            // no extra round-trip needed.
            const organizerUserId = purchase.sale?.organizer?.userId ?? null;

            if (!purchase.userId && organizerUserId) {
              const organizerUser = await prisma.user.findUnique({
                where: { id: organizerUserId },
                select: { stripeCardFingerprint: true },
              });
              if (organizerUser?.stripeCardFingerprint && organizerUser.stripeCardFingerprint === cardFp) {
                guestFraudBlocked = true;
                await recordConfirmedSignal(prisma, {
                  userId: organizerUserId,
                  itemId: purchase.itemId,
                  saleId: purchase.saleId!,
                  signalType: 'SHARED_CARD_FP',
                  notes: `[webhook-guest] Guest checkout payment card fingerprint matches sale organizer's card fingerprint (self-dealing via guest identity). PI ${paymentIntent.id}.`,
                });
              }
            }

            // Cross-purchase collusion check (P0 #2): any OTHER purchase on this same sale
            // sharing this card fingerprint — matched directly via Purchase.buyerCardFingerprint
            // (covers guest-vs-guest) OR via the related User's stored fingerprint (covers
            // guest-vs-authenticated and authenticated-vs-authenticated). Runs for every
            // purchase, not just guests, since this is the only point a guest row is visible
            // to a collusion query at all.
            if (!guestFraudBlocked) {
              const collidingPurchase = await prisma.purchase.findFirst({
                where: {
                  saleId: purchase.saleId!,
                  id: { not: purchase.id },
                  OR: [
                    { buyerCardFingerprint: cardFp },
                    { user: { stripeCardFingerprint: cardFp } },
                  ],
                },
                select: { id: true, userId: true },
              });

              if (collidingPurchase) {
                guestFraudBlocked = true;
                // Flag whichever side of the collision has a real account; if both sides are
                // guests (no User to flag), fall back to the organizer as the sale-level flag
                // point — FraudSignal.userId is a required FK, there is no "no user" option.
                const flagUserId = purchase.userId ?? collidingPurchase.userId ?? organizerUserId;
                if (flagUserId) {
                  await recordConfirmedSignal(prisma, {
                    userId: flagUserId,
                    itemId: purchase.itemId,
                    saleId: purchase.saleId!,
                    signalType: 'SHARED_CARD_FP',
                    notes: `[webhook-guest] Purchase ${purchase.id} shares a card fingerprint with purchase ${collidingPurchase.id} on the same sale (2-buyers-1-card pattern, guest-inclusive check). PI ${paymentIntent.id}.`,
                  });
                } else {
                  console.error(`[checkoutGuard][guest] Card-fingerprint collusion detected between purchases ${purchase.id} and ${collidingPurchase.id} on sale ${purchase.saleId} — no User row on either side to flag.`);
                }
              }
            }
          }
        } catch (err) {
          console.error('[checkoutGuard][guest] Failed to run guest/collusion fraud check (non-fatal — does not block fulfillment on an error, only on a confirmed match):', err);
        }
      }

      if (guestFraudBlocked && purchase) {
        try {
          // PART A (2026-07-28) — system-initiated refund on a sale that never validly
          // completed (confirmed collusion / self-dealing). Claw the money back off the
          // organizer as well as the buyer: on a destination charge reverse_transfer and
          // refund_application_fee must be set TOGETHER or the platform eats the loss.
          // See isDestinationCharge for the Stripe semantics and the guard rationale.
          //
          // Stable idempotency key copies the createRefund idiom below
          // (`refund-${purchase.id}`). The webhook's ProcessedWebhookEvent gate REPROCESSES
          // an event whose prior attempt was marked FAILED, so without a key a Stripe retry
          // would issue a second refunds.create and a second Transfer reversal.
          await stripe().refunds.create(
            {
              payment_intent: paymentIntent.id,
              ...(isDestinationCharge(paymentIntent)
                ? { reverse_transfer: true, refund_application_fee: true }
                : {}),
            },
            { idempotencyKey: `refund-guest-fraud-${paymentIntent.id}` }
          );
          // P0 fix (2026-08-07): only mark REFUNDED once Stripe has actually confirmed the
          // refund. Previously this write ran unconditionally after the try/catch below,
          // regardless of whether refunds.create succeeded -- a confirmed-fraud purchase
          // could be mislabeled REFUNDED while the money was never actually returned.
          await prisma.purchase.updateMany({
            where: { stripePaymentIntentId: paymentIntent.id },
            data: { status: 'REFUNDED' },
          });
          console.warn(`[checkoutGuard][guest] Blocked fulfillment + refunded PI ${paymentIntent.id} — collusion/self-dealing signal confirmed.`);
        } catch (refundErr) {
          // P0 fix (2026-08-07): this refund failing means a CONFIRMED-fraudulent charge is
          // now stuck on the platform -- fulfillment is still blocked (we break below either
          // way) but no money has moved and, until this fix, nothing recorded that fact
          // anywhere. 'REFUND_FAILED' is a NEW Purchase.status value -- Purchase.status is a
          // plain String field (not a Prisma enum; see refundService.ts's documented list:
          // PENDING, PAID, REFUNDED, FAILED, DISPUTED), so this needs no schema change. No
          // status already in use in this codebase covers "confirmed-fraud refund attempt
          // failed, needs manual review" -- this is a judgment call, not a reuse of an
          // established convention. Flagged for Patrick/QA double-check.
          console.error(`[checkoutGuard][guest] Failed to auto-refund blocked guest PI ${paymentIntent.id}:`, refundErr);
          await prisma.purchase.updateMany({
            where: { stripePaymentIntentId: paymentIntent.id },
            data: { status: 'REFUND_FAILED' },
          });
          try {
            Sentry.captureException(refundErr instanceof Error ? refundErr : new Error(String(refundErr)), {
              tags: { area: 'guest-fraud-auto-refund-failed' },
              extra: { paymentIntentId: paymentIntent.id },
            });
          } catch {
            // Sentry may not be initialized -- silently continue
          }
        }
        break;
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

        await prisma.purchase.updateMany({
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
          // Flat 10 XP per purchase (D-XP-004 — not per dollar)
          const baseXp = XP_AWARDS.PURCHASE;
          const multipliedXp = await applyHuntPassMultiplier(purchase.userId, baseXp);

          // P0 Exploit Fix: Add 72-hour hold to purchase XP (chargeback prevention)
          const holdUntil = new Date(Date.now() + 72 * 60 * 60 * 1000); // +72 hours

          awardXp(purchase.userId, 'PURCHASE_COMPLETED', multipliedXp, {
            itemId: purchase.itemId ?? undefined,
            saleId: purchase.saleId ?? undefined,
            purchaseId: purchase.id, // P0 Exploit Fix: link for claw-back
            holdUntil, // P0 Exploit Fix: 72-hour hold
            preMultipliedHuntPassXp: true,
          }).catch(err =>
            console.error('[XP] Failed to award XP for purchase completed:', err)
          );

          // Wire referral first-purchase reward
          try {
            const purchaseCount = await prisma.purchase.count({ where: { userId: purchase.userId } });
            if (purchaseCount === 1) {
              // This is their first purchase — award milestone XP
              awardXp(purchase.userId, 'FIRST_PURCHASE_EVER', XP_AWARDS.FIRST_PURCHASE_EVER, {
                saleId: purchase.saleId ?? undefined,
                description: 'First purchase milestone'
              }).catch(err =>
                console.error('[XP] Failed to award first purchase milestone XP:', err)
              );

              // Feature: Record referral tranche first purchase (non-blocking)
              try {
                await referralTrancheService.recordFirstPurchase(purchase.userId, purchase.id);

                // Also check if this buyer was themselves a referred user
                // If so, trigger Tranche D for their referrer (own-referral success)
                const buyerReferral = await prisma.referral.findUnique({
                  where: { referredUserId: purchase.userId },
                });
                if (buyerReferral) {
                  await referralTrancheService.recordOwnReferralSuccess(purchase.userId);
                }
              } catch (err) {
                console.error('[referralTranche] recordFirstPurchase failed:', err);
                // Never fail the purchase completion due to tranche logic
              }

              // ORG_SHOPPER_SIGNUP: Award 10 XP to the organizer when a new shopper makes their first purchase
              // Per gamedesign spec: fires on first purchase only, no monthly cap
              try {
                const saleOrganizer = purchase.sale?.organizer;
                const orgUserId = saleOrganizer?.userId;

                if (orgUserId) {
                  // Idempotency: use purchaseId to ensure this exact purchase doesn't double-award
                  const alreadyAwarded = await prisma.pointsTransaction.findFirst({
                    where: {
                      userId: orgUserId,
                      type: 'ORG_SHOPPER_SIGNUP',
                      purchaseId: purchase.id,
                    },
                  });

                  if (!alreadyAwarded) {
                    awardXp(orgUserId, 'ORG_SHOPPER_SIGNUP', XP_AWARDS.ORG_SHOPPER_SIGNUP, {
                      saleId: purchase.saleId ?? undefined,
                      purchaseId: purchase.id,
                      description: `New shopper first purchase at sale ${purchase.saleId}`,
                    }).catch(err => console.error('[XP] Failed to award ORG_SHOPPER_SIGNUP:', err));
                  }
                }
              } catch (err) {
                console.error('[XP] Failed to check ORG_SHOPPER_SIGNUP eligibility:', err);
              }

              // Check referral reward eligibility
              try {
                const referralReward = await prisma.referralReward.findFirst({
                  where: { referredUserId: purchase.userId }
                });

                if (referralReward) {
                  const referrer = await prisma.user.findUnique({
                    where: { id: referralReward.referrerId }
                  });

                  if (referrer) {
                    // D-XP-004 Phase 3: Evaluate referral fraud (observational)
                    const fraudEval = await evaluateReferralFraud(
                      referralReward.referrerId,
                      purchase.userId,
                      referralReward.id
                    );

                    // D-XP-004 Phase 4: Account age gate
                    const ageDays = getAccountAgeDays(
                      await prisma.user.findUnique({
                        where: { id: purchase.userId },
                        select: { createdAt: true }
                      }).then(u => u?.createdAt || new Date())
                    );

                    if (ageDays < MIN_ACCOUNT_AGE_DAYS) {
                      // Defer the reward: too young
                      const deferUntilDate = new Date();
                      deferUntilDate.setDate(
                        deferUntilDate.getDate() + (MIN_ACCOUNT_AGE_DAYS - ageDays)
                      );

                      await prisma.referralReward.update({
                        where: { id: referralReward.id },
                        data: {
                          deferredUntil: deferUntilDate,
                          deferredReason: 'ACCOUNT_AGE_GATE'
                        }
                      });

                      console.log(
                        `[referralReward] Deferred XP award for referrer ${referralReward.referrerId} (account age gate, ${ageDays}/${MIN_ACCOUNT_AGE_DAYS} days)`
                      );
                    } else if (referralReward.fraudReviewStatus === 'CLEAR') {
                      // Account is old enough and fraud status is clear — award XP to referrer
                      // P0 Security Fix: Add 24h payment clearance hold per gamedesign spec
                      const referralXpHoldUntil = new Date(purchase.createdAt.getTime() + 24 * 60 * 60 * 1000);
                      awardXp(referralReward.referrerId, 'REFERRAL_FIRST_PURCHASE', XP_AWARDS.REFERRAL_FIRST_PURCHASE, {
                        saleId: purchase.saleId ?? undefined,
                        purchaseId: purchase.id, // P0 Security Fix: link for chargeback claw-back
                        holdUntil: referralXpHoldUntil, // P0 Security Fix: 24h clearance hold per gamedesign spec
                        description: 'First purchase referral bonus'
                      }).catch(err =>
                        console.error('[XP] Failed to award first-purchase referral XP:', err)
                      );
                    } else {
                      // Fraud review pending — defer until reviewed
                      console.log(
                        `[referralReward] Deferred XP award for referrer ${referralReward.referrerId} (fraud review pending)`
                      );
                    }
                  }
                }
              } catch (fraudCheckErr) {
                console.error('[referralReward] Fraud check failed, deferring caution:', fraudCheckErr);
                // On error, defer to be safe
              }
            }
          } catch (err) {
            console.error('[XP] Failed to check first-purchase referral:', err);
          }

          // P0 Security Fix: Check if buyer is a referred organizer, and if so, award 500 XP to referrer
          // This prevents XP farming by requiring an actual external purchase
          try {
            const organizerReferral = await prisma.organizerReferral.findUnique({
              where: { refereeId: purchase.userId }
            });

            if (organizerReferral && organizerReferral.status === 'PENDING') {
              // Count completed purchases where buyer is the referee AND NOT the referrer
              const externalPurchaseCount = await prisma.purchase.count({
                where: {
                  userId: purchase.userId,
                  status: 'PAID',
                  // Ensure buyer is not the referrer (prevents self-dealing)
                  sale: {
                    organizer: {
                      userId: {
                        not: organizerReferral.referrerId
                      }
                    }
                  }
                }
              });

              if (externalPurchaseCount >= 1) {
                // Referee has made at least one valid external purchase — award XP to referrer
                // P0 Security Fix: Update status FIRST (idempotency gate), then award XP
                // If status update fails, retry is safe (still PENDING). If award fails, next webhook retry is safe (status already CREDITED).
                await prisma.organizerReferral.update({
                  where: { refereeId: purchase.userId },
                  data: { status: 'CREDITED' }
                });

                // Only after status is committed do we fire the XP award
                awardXp(organizerReferral.referrerId, 'ORGANIZER_REFERRAL_PURCHASE', XP_AWARDS.ORGANIZER_REFERRAL_PURCHASE, {
                  saleId: purchase.saleId ?? undefined,
                  purchaseId: purchase.id, // P0 Security Fix: link for chargeback claw-back
                  holdUntil: new Date(Date.now() + 72 * 60 * 60 * 1000), // P0 Security Fix: 72h chargeback hold
                  description: 'Referred organizer completed external purchase'
                }).catch(err =>
                  console.error('[XP] Failed to award organizer referral XP:', err)
                );
              }
            }
          } catch (err) {
            console.error('[XP] Failed to check organizer referral qualification:', err);
          }
        }

        // Feature #404: OG Buyer badge — first 100 purchasers at a sale
        if (purchase.userId && purchase.saleId) {
          checkAndAwardOgBuyer(purchase.userId, purchase.saleId, purchase.id).catch(err =>
            console.error('[OG Buyer] Badge award failed:', err)
          );
        }

        // Notify organizer of payment received
        // Root-caused 2026-07-29 (Row 14): this call wrote an in-app Notification row
        // only -- sendEmail was never passed, so organizers away from the app had no
        // way to learn a sale happened until they opened it. createNotification()
        // (packages/backend/src/lib/notificationService.ts) only emails when told to.
        // S1183 follow-up (buyer j drummond / purchase cms6cald1003hgspm3xw6qssk never
        // notified organizer "Artifact"): added branch + outcome logging so a future
        // occurrence can be root-caused from Railway logs alone -- distinguishes
        // (a) the guard being skipped because organizer.userId did not resolve, from
        // (b) createNotification() being attempted but throwing, vs attempted and
        // succeeding. Previously this branch had no "skipped" log at all, and the
        // "attempted" path only logged on failure -- so neither hypothesis was
        // distinguishable after the fact from logs alone.
        // S1195 (2026-08-08, notification-gap dispatch): a multi-item cart checkout
        // (checkout.session.completed's cart_checkout branch) creates N Purchase rows that
        // all share this exact stripePaymentIntentId (schema.prisma: "one PI may have
        // multiple Purchase rows (multi-item cart)"). Stripe does not guarantee event
        // delivery order, so if cart_checkout's transaction commits before this
        // payment_intent.succeeded webhook runs, `purchase` above resolves to just the
        // FIRST of those N rows via findFirst(). Sending the single-item notification below
        // in that case would (a) reference only one of the purchased items' titles, and (b)
        // duplicate the aggregate cart notification cart_checkout now sends itself (see
        // "S1195" comment there). Detect via sibling-row count and defer to cart_checkout as
        // the single source of truth for multi-item cart notifications.
        const siblingPurchaseCount = await prisma.purchase.count({
          where: { stripePaymentIntentId: paymentIntent.id },
        });
        const notifyOrganizerUserId = purchase.sale?.organizer?.userId;
        if (siblingPurchaseCount > 1) {
          console.log(
            `[PaymentNotification] Skipped single-item payment_received notification for purchase ${purchase.id} -- ` +
            `${siblingPurchaseCount} Purchase rows share PaymentIntent ${paymentIntent.id} (multi-item cart checkout; ` +
            `notified via checkout.session.completed's cart_checkout branch instead)`
          );
        } else if (notifyOrganizerUserId) {
          console.log(
            `[PaymentNotification] Attempting payment_received notification for purchase ${purchase.id} (organizerUserId=${notifyOrganizerUserId})`
          );
          createNotification({
            userId: notifyOrganizerUserId,
            type: 'payment_received',
            title: 'Payment received',
            body: `Payment of $${(paymentIntent.amount_received / 100).toFixed(2)} received for "${purchase.item?.title || 'item'}"`,
            link: `/organizer/sales/${purchase.saleId}`,
            channel: 'OPERATIONAL',
            sendEmail: true,
          }).then(() => {
            console.log(
              `[PaymentNotification] createNotification succeeded for purchase ${purchase.id} (organizerUserId=${notifyOrganizerUserId})`
            );
          }).catch((err) => {
            console.error(
              `[PaymentNotification] createNotification failed for purchase ${purchase.id} (organizerUserId=${notifyOrganizerUserId}):`,
              err instanceof Error ? (err.stack || err.message) : err
            );
          });
        } else {
          console.error(
            `[PaymentNotification] Skipped payment_received notification for purchase ${purchase.id} -- ` +
            `organizer.userId did not resolve (saleId=${purchase.saleId ?? 'null'}, ` +
            `sale present=${!!purchase.sale}, sale.organizer present=${!!purchase.sale?.organizer})`
          );
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
            // PART A (2026-07-28) — system-initiated refund: the item was already SOLD to
            // another buyer, so this buyer receives nothing and the organizer earned nothing
            // on this PaymentIntent. Both flags together (see isDestinationCharge), plus a
            // stable idempotency key so a webhook retry after a FAILED attempt cannot
            // double-refund the buyer or double-reverse the organizer's Transfer.
            await stripe().refunds.create(
              {
                payment_intent: paymentIntent.id,
                ...(isDestinationCharge(paymentIntent)
                  ? { reverse_transfer: true, refund_application_fee: true }
                  : {}),
              },
              { idempotencyKey: `refund-ca3-${paymentIntent.id}` }
            );
            await prisma.purchase.updateMany({
              where: { stripePaymentIntentId: paymentIntent.id },
              data: { status: 'REFUNDED' },
            });
            break;
          }

          // ADR-085 Track B Phase 1 Step 4: atomic, race-safe stock decrement replaces the
          // old unconditional status update. Downstream cross-channel removal hooks only
          // fire once the item is actually fully sold out.
          let soldOut3: boolean;
          let remainingStock3: number | undefined;
          try {
            ({ fullySoldOut: soldOut3, remainingStock: remainingStock3 } = await sellItemUnits(paymentIntent.metadata.itemId, 1));
          } catch (stockErr: any) {
            if (stockErr instanceof InsufficientStockError) {
              console.warn(`CA3: item ${paymentIntent.metadata.itemId} already fully sold (race), not an error:`, stockErr.message);
              soldOut3 = false;
            } else {
              throw stockErr;
            }
          }
          const soldItem = soldOut3 ? await prisma.item.findUnique({ where: { id: paymentIntent.metadata.itemId } }) : null;

          if (soldOut3) {
            // Fire-and-forget: end eBay listing if item was pushed there
            endEbayListingIfExists(paymentIntent.metadata.itemId).catch(err =>
              console.error('[eBay] Failed to withdraw offer:', err)
            );
            markShopifyItemSold(paymentIntent.metadata.itemId).catch(err =>
              console.error('[Shopify] Failed to mark item sold:', err)
            );
            notifyFacebookExportedItemSold(paymentIntent.metadata.itemId).catch(err =>
              console.warn(`[FB Nudge] failed for item ${paymentIntent.metadata.itemId}:`, err.message)
            );
          } else if (remainingStock3 !== undefined) {
            // ADR-087 Phase 4: partial sale — revise eBay listing quantity if linked.
            // Guarded on remainingStock3 !== undefined so the InsufficientStockError
            // race-fallback branch above (which sets soldOut3=false without a real
            // remainingStock value) never fires a sync with a bogus number.
            syncMarketplaceStock(paymentIntent.metadata.itemId, { fullySoldOut: false, remainingStock: remainingStock3 }).catch(err =>
              console.error('[eBay ReviseQty] sync failed for item', paymentIntent.metadata.itemId, err)
            );
          }

          if (soldItem) {
            try {
              const io = getIO();
              pushEvent(io, soldItem.saleId!, {
                type: 'SOLD',
                itemTitle: soldItem.title,
                amount: soldItem.price || undefined,
                saleId: soldItem.saleId!,
                timestamp: new Date(),
              });
            } catch (err) {
              console.warn('[liveFeed] Failed to emit sold event:', err);
            }

            try {
              const io = getIO();
              await pushSaleStatus(io, soldItem.saleId!);
            } catch (err) {
              console.warn('[saleStatus] Failed to push status update:', err);
            }

            try {
              const saleData = await prisma.sale.findUnique({
                where: { id: soldItem.saleId! },
                include: {
                  organizer: { include: { user: { select: { email: true, name: true } } } },
                  items: { where: { id: paymentIntent.metadata.itemId }, select: { consignorId: true } }
                },
              });
              if (saleData?.organizer?.user) {
                setImmediate(() => {
                  sendItemSoldAlert({
                    organizerEmail: saleData.organizer.user.email,
                    organizerName: saleData.organizer.user.name,
                    itemTitle: soldItem.title,
                    saleTitle: saleData.title,
                    price: soldItem.price || 0,
                    saleId: soldItem.saleId!,
                  }).catch(err => console.warn('[alert] Failed to send item sold email:', err));
                });
              }

              // Feature #309: Send email to consignor if item has consignor
              const soldItemWithConsignor = saleData?.items?.[0];
              if (soldItemWithConsignor?.consignorId) {
                try {
                  const consignor = await prisma.consignor.findUnique({
                    where: { id: soldItemWithConsignor.consignorId },
                  });
                  if (consignor?.email) {
                    const consignorPayout = soldItem.price ? (soldItem.price * (100 - Number(consignor.commissionRate))) / 100 : 0;
                    setImmediate(() => {
                      sendConsignorItemSold({
                        consignorName: consignor.name,
                        consignorEmail: consignor.email ?? '',
                        itemName: soldItem.title,
                        itemPrice: soldItem.price || 0,
                        consignorPayout,
                        organizerName: saleData?.organizer?.user?.name ?? '',
                        saleId: soldItem.saleId!,
                      }).catch(err => console.warn('[consignor-email] Failed to send item sold email:', err));
                    });
                  }
                } catch (err) {
                  console.warn('[consignor-email] Failed to fetch consignor data:', err);
                }
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

          // issueLoyaltyCoupon disabled S404 — not in Explorer's Guild spec
          // issueLoyaltyCoupon(purchase.userId, purchase.id)
          //   .catch(err => console.warn('[coupon] Failed to issue loyalty coupon:', err));

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

        // Guest checkout (2026-07-18): purchase.user is null for guests (no User row) —
        // sendReceiptEmail only needs email/name strings, so guests get the same receipt
        // using Purchase.buyerEmail/guestName captured at checkout time.
        const receiptRecipient = purchase.user
          ? { email: purchase.user.email, name: purchase.user.name }
          : (purchase.buyerEmail ? { email: purchase.buyerEmail, name: purchase.guestName || 'there' } : null);

        if (!isPOS && receiptRecipient) {
          // Platform Safety #97: Calculate itemized breakdown for receipt
          // We don't have full itemization data in webhook context, but we have the totals
          // Frontend-side reconstruction or enhanced tracking would improve this
          await sendReceiptEmail({
            id: purchase.id,
            amount: purchase.amount,
            user: receiptRecipient,
            item: purchase.item,
            sale: purchase.sale,
            // Note: For full itemization, the frontend should include this in metadata
            // or we could implement a payment_intent.amount_capturable event hook
          });
        }

        // #404: First 100 Buyers Badge — award to all 100 distinct purchasers when sale hits 100
        if (purchase.saleId && purchase.userId) {
          (async () => {
            try {
              const saleId = purchase.saleId!;
              const distinctBuyerCount = await (prisma as any).$queryRaw`
                SELECT COUNT(DISTINCT "userId") as cnt
                FROM "Purchase"
                WHERE "saleId" = ${saleId}
                AND status = 'PAID'
                AND "userId" IS NOT NULL
              ` as Array<{ cnt: bigint }>;
              const buyerCount = Number(distinctBuyerCount[0]?.cnt ?? 0);

              if (buyerCount === 100) {
                // Find or create the First 100 Buyers badge (idempotent upsert)
                const badgeName = 'First 100 Buyers';
                let badge = await prisma.badge.findUnique({ where: { name: badgeName } });
                if (!badge) {
                  badge = await prisma.badge.create({
                    data: {
                      name: badgeName,
                      description: 'Awarded to the first 100 shoppers to complete a purchase at this sale.',
                      criteria: { type: 'first_100_buyers', saleId },
                    },
                  });
                }

                // Fetch all 100 distinct purchaser userIds for this sale
                const purchasers = await (prisma as any).$queryRaw`
                  SELECT DISTINCT "userId"
                  FROM "Purchase"
                  WHERE "saleId" = ${saleId}
                  AND status = 'PAID'
                  AND "userId" IS NOT NULL
                  LIMIT 100
                ` as Array<{ userId: string }>;

                for (const { userId } of purchasers) {
                  // Idempotency: skip if already has this badge
                  const existing = await prisma.userBadge.findUnique({
                    where: { userId_badgeId: { userId, badgeId: badge.id } },
                  });
                  if (!existing) {
                    await prisma.userBadge.create({ data: { userId, badgeId: badge.id } });
                    awardXp(userId, 'BADGE_EARNED', 50, {
                      saleId,
                      description: 'First 100 Buyers badge',
                    }).catch((err: any) => console.error('[XP] First 100 Buyers XP failed:', err));
                  }
                }
                console.log(`[badge] First 100 Buyers awarded for sale ${saleId}`);
              }
            } catch (err) {
              console.error('[badge] First 100 Buyers check failed:', err);
            }
          })();
        }

        // #399: Local Legend Badge — 3rd purchase at sales in the same ZIP code
        if (purchase.userId && purchase.saleId && (purchase.sale as any)?.zip) {
          (async () => {
            try {
              const userId = purchase.userId!;
              const saleZip = (purchase.sale as any).zip as string;
              const badgeName = 'Local Legend';

              const zipPurchaseCount = await prisma.purchase.count({
                where: {
                  userId,
                  status: 'PAID',
                  item: { sale: { zip: saleZip } },
                },
              });

              if (zipPurchaseCount === 3) {
                // Find or create the Local Legend badge
                let badge = await prisma.badge.findUnique({ where: { name: badgeName } });
                if (!badge) {
                  badge = await prisma.badge.create({
                    data: {
                      name: badgeName,
                      description: 'Awarded for completing 3 purchases at sales in the same ZIP code.',
                      criteria: { type: 'local_legend', minPurchases: 3 },
                    },
                  });
                }

                // Idempotency: skip if already has badge
                const existing = await prisma.userBadge.findUnique({
                  where: { userId_badgeId: { userId, badgeId: badge.id } },
                });
                if (!existing) {
                  await prisma.userBadge.create({ data: { userId, badgeId: badge.id } });
                  awardXp(userId, 'BADGE_EARNED', 75, {
                    saleId: purchase.saleId ?? undefined,
                    description: 'Local Legend badge',
                  }).catch((err: any) => console.error('[XP] Local Legend XP failed:', err));
                  console.log(`[badge] Local Legend awarded to user ${userId} (zip: ${saleZip})`);
                }
              }
            } catch (err) {
              console.error('[badge] Local Legend check failed:', err);
            }
          })();
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

      // À-la-carte sale fee: apply alaCarteFeePaid via PI metadata
      if (paymentIntent.metadata?.type === 'ALA_CARTE' && paymentIntent.metadata?.saleId) {
        try {
          await prisma.sale.update({
            where: { id: paymentIntent.metadata.saleId },
            data: { alaCarteFeePaid: true, purchaseModel: 'ALA_CARTE', alaCarte: true },
          });
          console.log(`[ala-carte] Sale ${paymentIntent.metadata.saleId} marked alaCarteFeePaid via PI webhook`);
        } catch (err: any) {
          console.error('[ala-carte] Failed to update sale via PI webhook:', err);
        }
        // Idempotency: checkout.session.completed creates the Purchase record for ALA_CARTE.
        // This PI handler only creates one if no checkout session fired (e.g. direct PI flow).
        const existingPurchase = await prisma.purchase.findFirst({
          where: { saleId: paymentIntent.metadata.saleId, source: 'ALA_CARTE', status: 'PAID' },
        });
        if (!existingPurchase) {
          await prisma.purchase.create({
            data: {
              amount: 9.99,
              platformFeeAmount: 9.99,
              status: 'PAID',
              saleId: paymentIntent.metadata.saleId,
              stripePaymentIntentId: paymentIntent.id,
              source: 'ALA_CARTE',
              isTestTransaction: false,
            },
          }).catch((err: any) => console.error('[ala-carte] Failed to create Purchase via PI webhook:', err));
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
        // 2026-08-08 fix: pass { stripeAccount: event.account } when present so a
        // Direct-charge (booth-cart) dispute's retrieve doesn't fail against the platform
        // account -- see resolveDisputeContext's comment above for the full gap this closes.
        const charge = await stripe().charges.retrieve(
          chargeId,
          (event as any).account ? { stripeAccount: (event as any).account as string } : undefined
        );
        // charge.payment_intent may be a string ID or an expanded PaymentIntent object — normalize
        const paymentIntentId = typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : charge.payment_intent?.id ?? null;
        if (paymentIntentId) {
          const purchase = await prisma.purchase.findFirst({
            where: { stripePaymentIntentId: paymentIntentId },
            // organizer.userId added (2026-08-04 notification audit fix) -- needed to
            // notify the organizer a chargeback landed against their sale, below.
            include: { item: { include: { sale: { include: { organizer: { select: { userId: true } } } } } }, user: true }
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

              // P0 Exploit Fix: Claw back XP earned from the disputed purchase
              const { clawBackChargebackXp } = await import('../services/xpService');
              const clawedBackXp = await clawBackChargebackXp(purchase.id, purchase.user.id);
              console.log(`[stripe] Clawed back ${clawedBackXp} XP from user ${purchase.user.id} for chargeback`);
            }

            // Feature #107: Record chargeback incident in fraud tracking
            const { recordChargebackIncident } = await import('../services/fraudService');
            await recordChargebackIncident(
              purchase.item.sale!.organizerId,
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

            // Notification audit fix (2026-08-04): a Stripe chargeback (bank-level dispute,
            // distinct from the in-house Dispute model in disputeController.ts) previously
            // notified NO ONE on the organizer side -- the organizer only found out by
            // noticing a payout shortfall or checking the Stripe dashboard directly. Same
            // createNotification shape already used for payment_received above in this file.
            // Email on -- a chargeback is time-sensitive (organizers can submit evidence to
            // Stripe within a deadline) and must not rely on the organizer happening to open
            // the app.
            const disputeOrganizerUserId = purchase.item.sale!.organizer?.userId;
            if (disputeOrganizerUserId) {
              createNotification({
                userId: disputeOrganizerUserId,
                type: 'chargeback_opened',
                title: 'Chargeback filed against a sale',
                body: `A buyer's bank has filed a chargeback for "${purchase.item?.title || 'an item'}". This may affect your payout -- check Stripe for details and any response deadline.`,
                link: `/organizer/sales/${purchase.item.sale!.id}`,
                channel: 'OPERATIONAL',
                sendEmail: true,
              }).catch((err) => console.error(`[notification] Failed to create chargeback_opened notification for purchase ${purchase.id}:`, err));
            } else {
              console.error(`[stripe] Skipped chargeback_opened notification for purchase ${purchase.id} -- organizer.userId did not resolve`);
            }
          }
        }
      } catch (err) {
        // P0 fix (2026-08-07): chargeback handling (status update, chargeback count,
        // organizer notification) is time-boxed -- Stripe requires evidence within a fixed
        // deadline. A swallowed failure here previously left zero record anywhere that a
        // dispute even came in, risking a missed evidence deadline with no visibility.
        console.error(`[stripe] Failed to process dispute ${dispute.id}:`, err);
        try {
          // Best-effort organizer lookup for the alert only -- reuses the same charge/PI
          // lookup as the try block above, wrapped so a repeat failure here can never
          // block the alert itself from firing.
          let organizerIdForAlert: string | undefined;
          try {
            const chargeIdForAlert = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;
            if (chargeIdForAlert) {
              const chargeForAlert = await stripe().charges.retrieve(chargeIdForAlert);
              const piIdForAlert = typeof chargeForAlert.payment_intent === 'string'
                ? chargeForAlert.payment_intent
                : chargeForAlert.payment_intent?.id ?? null;
              if (piIdForAlert) {
                const purchaseForAlert = await prisma.purchase.findFirst({
                  where: { stripePaymentIntentId: piIdForAlert },
                  select: { item: { select: { sale: { select: { organizerId: true } } } } },
                });
                organizerIdForAlert = purchaseForAlert?.item?.sale?.organizerId;
              }
            }
          } catch {
            // Best-effort only -- alert still fires without organizer context
          }
          Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
            tags: { area: 'chargeback-dispute-processing' },
            extra: {
              disputeId: dispute.id,
              chargeId: typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id,
              evidenceDueBy: dispute.evidence_details?.due_by
                ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
                : null,
              organizerId: organizerIdForAlert,
            },
          });
        } catch {
          // Sentry may not be initialized -- silently continue
        }
      }
      break;
    }

    case 'charge.dispute.closed': {
      // Dispute clawback (2026-08-08) -- closes the gap where charge.dispute.created
      // above tracks a dispute but never moves any money: a real chargeback on a
      // DESTINATION charge auto-debits the PLATFORM's Stripe balance the moment the
      // dispute is created (Stripe's own mechanics, not something this code controls),
      // and recovering it from the organizer requires an explicit Transfer Reversal --
      // which nothing in this codebase did until now. Our own Terms of Service (§14b)
      // already promises organizers bear chargeback costs; this makes that promise true.
      //
      // Fires on CLOSE, not CREATE, and only when status === 'lost' -- deliberately, not
      // an oversight. Stripe debits the platform balance immediately at .created, before
      // any outcome is known; reversing the organizer's Transfer that early means a later
      // WIN (funds returned to the platform) would leave the platform owing the organizer
      // a second, un-triggered reversal-of-the-reversal. Waiting for a FINAL loss means
      // the organizer's balance is only ever touched once, and only for a loss that's
      // actually final -- same "only claw back what's genuinely lost" philosophy already
      // established by executeVerifiedRefund's PART B clawback (refundService.ts).
      const dispute = event.data.object as Stripe.Dispute;
      const connectedAccountId = (event as any).account as string | undefined;

      if (dispute.status !== 'lost') {
        // Won, warning_closed, etc. -- no money moves. (A "you won" notification is a
        // reasonable future addition; not required for this fix.)
        break;
      }

      try {
        const { paymentIntent, purchase } = await resolveDisputeContext(dispute, connectedAccountId);

        if (!purchase || !paymentIntent) {
          console.warn(`[stripe] charge.dispute.closed (lost): could not resolve Purchase for dispute ${dispute.id} -- skipping clawback.`);
          // findasale-hacker pass (2026-08-08): a 'lost' dispute with no resolvable Purchase
          // is never safe to silently drop -- Stripe already debited the platform for this,
          // and with no Purchase we have no organizer to claw it back from at all. Alert so a
          // human can trace it manually instead of it vanishing into console logs.
          Sentry.captureMessage('Dispute clawback: could not resolve Purchase/PaymentIntent for a lost dispute', {
            tags: { area: 'dispute-clawback' },
            extra: { disputeId: dispute.id, chargeId: typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id },
          });
          break;
        }

        // Direct-charges migration (2026-08-08): route on the persisted, authoritative
        // Purchase.chargeType rather than the isDestinationCharge(pi) inference below.
        // isDestinationCharge is retained ONLY as a defensive secondary check -- if it ever
        // disagrees with chargeType, that disagreement itself is a bug worth flagging, but
        // it must never override the persisted field's decision.
        const inferredDestination = isDestinationCharge(paymentIntent);
        if (inferredDestination !== (purchase.chargeType === 'DESTINATION')) {
          console.error(`[dispute-clawback] chargeType/inference mismatch: purchase.chargeType='${purchase.chargeType}' but isDestinationCharge(pi)=${inferredDestination} for PaymentIntent ${paymentIntent.id}, purchase ${purchase.id}`);
          Sentry.captureMessage('Dispute clawback: chargeType/inference mismatch', {
            tags: { area: 'dispute-clawback' },
            extra: { disputeId: dispute.id, purchaseId: purchase.id, paymentIntentId: paymentIntent.id, chargeType: purchase.chargeType, inferredDestination },
          });
        }

        if (purchase.chargeType === 'DIRECT') {
          // Direct charge (e.g. booth-cart, on the vendor's own connected account) --
          // Stripe already debited THAT account directly, per Stripe's own docs. There is
          // no platform-side Transfer to reverse; nothing to do here. Still logged (not a
          // silent no-op) so this is auditable.
          console.log(`[stripe] charge.dispute.closed (lost): Direct-charge dispute lost -- no platform-side reversal needed, liability already on connected account. PaymentIntent ${paymentIntent.id}, purchase ${purchase.id}.`);
          break;
        }

        if (!disputeClawbackEnabled()) {
          console.log(`[stripe] charge.dispute.closed (lost): STRIPE_DISPUTE_LIVE_CLAWBACK is off -- skipping reversal for dispute ${dispute.id} (purchase ${purchase.id}).`);
          break;
        }

        // TOCTOU claim, same compare-and-swap idiom as executeVerifiedRefund's PAID->
        // REFUNDING claim (refundService.ts) -- the primary defense against double-
        // reversal on webhook redelivery. Independent of, and in addition to, the
        // per-event.id ProcessedWebhookEvent dedup this handler already sits inside,
        // which only protects the identical event, not a logically-equivalent later one.
        const claim = await prisma.purchase.updateMany({
          where: { id: purchase.id, status: 'DISPUTED' },
          data: { status: 'DISPUTE_LOST' },
        });
        if (claim.count !== 1) {
          const currentPurchase = await prisma.purchase.findUnique({ where: { id: purchase.id }, select: { status: true } });
          if (currentPurchase?.status === 'DISPUTE_LOST') {
            // Safe, expected no-op: an earlier delivery of this (or an equivalent) event
            // already completed the clawback. Nothing wrong here.
            console.log(`[stripe] charge.dispute.closed (lost): purchase ${purchase.id} already DISPUTE_LOST -- clawback already applied, skipping.`);
          } else {
            // NOT safe: the purchase never reached DISPUTED in the first place (e.g.
            // charge.dispute.created's own status update silently failed, or webhook
            // reordering). The dispute is genuinely lost -- Stripe already debited the
            // platform -- but nothing will claw it back from the organizer unless a human
            // intervenes. Must not be a silent console.warn.
            console.error(`[stripe] charge.dispute.closed (lost): purchase ${purchase.id} was NOT in DISPUTED state (actual: ${currentPurchase?.status ?? 'not found'}) -- clawback skipped, dispute is genuinely lost and platform was debited. Needs manual review.`);
            Sentry.captureMessage('Dispute clawback skipped: purchase was not in DISPUTED state for a genuinely lost dispute', {
              tags: { area: 'dispute-clawback' },
              extra: { disputeId: dispute.id, purchaseId: purchase.id, actualStatus: currentPurchase?.status ?? null },
            });
          }
          break;
        }

        const charge = paymentIntent.latest_charge;
        const chargeId = typeof charge === 'string' ? charge : charge?.id;
        const chargeObj = chargeId
          ? await stripe().charges.retrieve(chargeId, connectedAccountId ? { stripeAccount: connectedAccountId } : undefined)
          : null;
        const transferId = chargeObj?.transfer as string | undefined;

        if (!transferId) {
          // Shouldn't happen for a confirmed destination charge (isDestinationCharge
          // already passed) -- but never silently mark DISPUTE_LOST with no reversal.
          await prisma.purchase.updateMany({ where: { id: purchase.id, status: 'DISPUTE_LOST' }, data: { status: 'DISPUTED' } });
          console.error(`[stripe] charge.dispute.closed (lost): no transfer id on charge ${chargeId} for dispute ${dispute.id} -- reverted claim, flagging.`);
          Sentry.captureMessage('Dispute clawback: charge has no transfer id', {
            tags: { area: 'dispute-clawback' },
            extra: { disputeId: dispute.id, purchaseId: purchase.id, chargeId },
          });
          break;
        }

        try {
          await stripe().transfers.createReversal(
            transferId,
            { amount: dispute.amount, refund_application_fee: true },
            { idempotencyKey: `dispute-reversal-${dispute.id}`, ...(connectedAccountId ? { stripeAccount: connectedAccountId } : {}) }
          );
        } catch (reversalErr) {
          // Revert the claim so a retry (manual or future redelivery) can still succeed --
          // never leave DISPUTE_LOST set with no actual money movement behind it.
          await prisma.purchase.updateMany({ where: { id: purchase.id, status: 'DISPUTE_LOST' }, data: { status: 'DISPUTED' } });
          console.error(`[stripe] charge.dispute.closed (lost): transfer reversal FAILED for dispute ${dispute.id}, purchase ${purchase.id}:`, reversalErr);
          Sentry.captureException(reversalErr instanceof Error ? reversalErr : new Error(String(reversalErr)), {
            tags: { area: 'dispute-clawback' },
            extra: { disputeId: dispute.id, purchaseId: purchase.id, transferId, amount: dispute.amount },
          });
          break;
        }

        console.log(`[stripe] charge.dispute.closed (lost): reversed transfer ${transferId} for dispute ${dispute.id}, purchase ${purchase.id}, amount=${dispute.amount}`);

        const clawbackOrganizerUserId = purchase.item?.sale?.organizer?.userId;
        if (clawbackOrganizerUserId) {
          createNotification({
            userId: clawbackOrganizerUserId,
            type: 'chargeback_clawback',
            title: 'Chargeback deducted from your payout',
            body: `$${(dispute.amount / 100).toFixed(2)} was deducted from your payout -- a chargeback for "${purchase.item?.title || 'an item'}" was decided against you.`,
            link: '/organizer/payouts',
            channel: 'OPERATIONAL',
            sendEmail: true,
          }).catch((err) => console.error(`[stripe] chargeback_clawback notification failed for purchase ${purchase.id} (non-fatal):`, err));
        } else {
          console.error(`[stripe] charge.dispute.closed (lost): clawback applied for purchase ${purchase.id} but organizer.userId did not resolve -- notification skipped`);
        }
      } catch (err) {
        console.error(`[stripe] Failed to process charge.dispute.closed for dispute ${dispute.id}:`, err);
        Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
          tags: { area: 'dispute-clawback' },
          extra: { disputeId: dispute.id },
        });
      }
      break;
    }

    case 'charge.dispute.funds_reinstated': {
      // Dispute clawback (2026-08-08) -- documented rare edge case: a dispute that was
      // already marked 'lost' (organizer already clawed back above) later flips to a
      // Stripe-driven "late win" and Stripe reinstates the funds to the PLATFORM balance.
      // Nothing here automatically returns that money to the organizer -- that would be
      // building reversal-of-reversal machinery for a rare, Stripe-timed edge case. This
      // is deliberately a Sentry alert only, so a human can true-up the organizer manually
      // via the existing admin refund/adjustment path if it ever fires.
      const dispute = event.data.object as Stripe.Dispute;
      console.warn(`[stripe] charge.dispute.funds_reinstated: dispute ${dispute.id} -- funds returned to platform after an earlier 'lost' clawback. Manual organizer true-up may be needed.`);
      Sentry.captureMessage('Dispute funds reinstated after a prior clawback -- manual organizer true-up may be needed', {
        tags: { area: 'dispute-late-win-reversal-needed' },
        extra: { disputeId: dispute.id, chargeId: typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id, amount: dispute.amount },
      });
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

      // P0-C: Record Hunt Pass cancellation timestamp (30-day post-cancel XP redemption hold)
      await markHuntPassCancellation(organizer.user.id);

      // Fire async job: send "Tier Lapsed" email
      setImmediate(() => {
        if (organizer.user?.email) {
          const fromEmail = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';
          transactionalEmailService.emails.send({
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
        if (organizer.user?.email) {
          const fromEmail = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';
          const baseUrl = process.env.FRONTEND_URL || 'https://finda.sale';
          transactionalEmailService.emails.send({
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
        const oldTier = organizer.subscriptionTier;
        if (subscription.items?.data?.[0]?.price?.id) {
          const priceId = subscription.items.data[0].price.id;
          if (priceId === process.env.STRIPE_PRO_MONTHLY_PRICE_ID) newTier = 'PRO';
          else if (priceId === process.env.STRIPE_TEAMS_MONTHLY_PRICE_ID) newTier = 'TEAMS';
        }

        await prisma.organizer.update({
          where: { id: organizer.id },
          data: {
            subscriptionTier: newTier,
            subscriptionStatus: subscription.status,
            tokenVersion: organizer.tokenVersion + 1, // Invalidate stale JWTs
          }
        });

        // Award XP if upgrading to PRO (resumption path)
        if (oldTier !== 'PRO' && newTier === 'PRO') {
          const xpResult = await awardProUpgradeXp(organizer.id);
          if (xpResult?.success) {
            console.log(
              `[referral-xp] PRO upgrade XP awarded to shopper ${xpResult.shopperId} ` +
              `for organizer ${organizer.id} (${xpResult.xpAwarded} XP)`
            );
          }
        }

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
        const oldTier = organizer.subscriptionTier;
        if (subscription.items?.data?.[0]?.price?.id) {
          const priceId = subscription.items.data[0].price.id;
          if (priceId === process.env.STRIPE_PRO_MONTHLY_PRICE_ID) newTier = 'PRO';
          else if (priceId === process.env.STRIPE_TEAMS_MONTHLY_PRICE_ID) newTier = 'TEAMS';
        }

        // S1197: bump tokenVersion on every tier-affecting update, matching syncTier.ts
        // (used by billingController.ts's webhook handler). Previously this "normal
        // update" branch (plain upgrade/downgrade while status stays active/past_due)
        // never invalidated the stale tier claim baked into already-issued JWTs — the
        // OTHER branch above (resume from past_due/canceled) did bump it, so the two
        // handlers disagreed on when a tier change should invalidate old tokens. A
        // stale JWT's 401 (from the mismatched organizerTokenVersion) is recoverable via
        // POST /auth/refresh's silent token reissue — see routes/auth.ts refresh handler,
        // which already re-reads organizer.tokenVersion fresh from the DB — so bumping
        // here does not force a hard logout, it correctly marks the old token as needing
        // a refresh.
        await prisma.organizer.update({
          where: { id: organizer.id },
          data: {
            subscriptionStatus: subscription.status,
            subscriptionTier: newTier,
            tokenVersion: organizer.tokenVersion + 1,
          }
        });

        // Award XP if upgrading to PRO (normal update path)
        if (oldTier !== 'PRO' && newTier === 'PRO') {
          const xpResult = await awardProUpgradeXp(organizer.id);
          if (xpResult?.success) {
            console.log(
              `[referral-xp] PRO upgrade XP awarded to shopper ${xpResult.shopperId} ` +
              `for organizer ${organizer.id} (${xpResult.xpAwarded} XP)`
            );
          }
        }

        // Notification-gap fix (S1195 sweep continuation, 2026-08-08): a Stripe-side
        // plan change (e.g. organizer downgrades PRO->SIMPLE or TEAMS->PRO via the
        // Stripe customer billing portal, distinct from the full-cancellation path
        // above at 'customer.subscription.deleted' which already emails) previously
        // updated subscriptionTier silently -- no in-app row, no email. A downgrade is
        // a real, immediate change to what the organizer can do: getPlatformFeeRate()
        // (packages/backend/src/utils/feeCalculator.ts) jumps their per-sale platform
        // fee from 8% (PRO/TEAMS) back to 10% (SIMPLE) on every future sale. Only fires
        // on an actual downgrade (rank decrease), not on upgrade or a same-tier renewal
        // sync -- upgrades already get positive reinforcement via the XP award above and
        // don't need a "your account changed" alert. sendEmail: true, mirroring the
        // admin-initiated organizer_tier_changed notification in adminController.ts
        // (same event class, different trigger).
        const tierRank: Record<'SIMPLE' | 'PRO' | 'TEAMS', number> = { SIMPLE: 0, PRO: 1, TEAMS: 2 };
        if (tierRank[newTier] < tierRank[oldTier as 'SIMPLE' | 'PRO' | 'TEAMS']) {
          const newFeePct = newTier === 'SIMPLE' ? '10%' : '8%';
          createNotification({
            userId: organizer.user.id,
            type: 'organizer_tier_changed',
            title: 'Your FindA.Sale plan has changed',
            body: `Your organizer account was moved from ${oldTier} to ${newTier} by your payment provider. Your platform fee on future sales is now ${newFeePct}, and any ${oldTier}-only features are no longer available. If this wasn't intentional, check your billing settings.`,
            link: '/organizer/settings',
            channel: 'OPERATIONAL',
            sendEmail: true,
          }).catch((err: unknown) => {
            console.error('[SecurityNotification] Failed to send organizer_tier_changed (Stripe-side downgrade) notification:', err);
          });
        }
      }

      break;
    }
    case 'checkout.session.completed': {
      const session = event.data.object;

      // Safety net: test-mode checkout sessions must never deplete inventory
      if (!event.livemode || session.metadata?.isTestTransaction === 'true') {
        console.log(`[test-checkout] Test checkout session ${session.id} completed — inventory preserved`);
        break;
      }

      // #132: À La Carte Single-Sale Fee ($9.99)
      if (session.metadata?.type === 'ALA_CARTE' && session.metadata?.saleId) {
        await prisma.sale.update({
          where: { id: session.metadata.saleId },
          data: {
            alaCarteFeePaid: true,
            purchaseModel: 'ALA_CARTE',
            alaCarte: true,
          },
        }).catch(err => console.error('[ala-carte] Failed to update sale after checkout:', err));
        // Create Purchase record for revenue tracking
        try {
          await prisma.purchase.create({
            data: {
              amount: 9.99,
              platformFeeAmount: 9.99,
              status: 'PAID',
              saleId: session.metadata.saleId,
              stripePaymentIntentId: typeof session.payment_intent === 'string'
                ? session.payment_intent
                : (session.payment_intent as any)?.id ?? null,
              source: 'ALA_CARTE',
              isTestTransaction: false,
            },
          });
          console.log(`[ala-carte] Purchase record created for sale ${session.metadata.saleId}`);
        } catch (purchaseErr: any) {
          console.error('[ala-carte] Failed to create Purchase record:', purchaseErr);
        }
      }
      // Hold-to-Pay Phase 2: Handle checkout session completion for invoices.
      // Guarded (ADR pos-webhook-idempotency-reconciliation 2026-07-23): a transient failure
      // retrieving the PaymentIntent here only feeds a hold-to-pay log line and must NEVER
      // abort the POS / cart recording that follows.
      if (session.payment_intent) {
        try {
          const paymentIntent = await stripe().paymentIntents.retrieve(session.payment_intent as string);
          if (paymentIntent.metadata?.invoiceId) {
            // This is a hold-to-pay invoice -- wait for charge.succeeded for actual payment
            console.log(`[hold-to-pay] Checkout session completed for invoice ${paymentIntent.metadata.invoiceId}`);
          }
        } catch (piErr: any) {
          console.error(`[hold-to-pay] Non-fatal: failed to retrieve PaymentIntent for session ${session.id}:`, piErr?.message ?? piErr);
        }
      }
      // POS Upgrade: Payment Link self-checkout via QR (session.payment_link is set when triggered by a Payment Link)
      if (!session.payment_link) {
        console.log(`[pos] checkout.session.completed ${session.id} has no payment_link field -- not a POS QR sale (metadata.type=${session.metadata?.type ?? 'none'}).`);
      }
      if (session.payment_link) {
        const stripePaymentLinkId = typeof session.payment_link === 'string'
          ? session.payment_link
          : (session.payment_link as { id: string }).id;

        const posPaymentLink = await prisma.pOSPaymentLink.findUnique({
          where: { stripePaymentLinkId },
        });

        if (posPaymentLink) {
          // ADR pos-webhook-idempotency-reconciliation (2026-07-23, S1151): recording is now
          // a shared, idempotent, transaction-based function reused by the stranded-sale
          // reconciliation cron. An already-COMPLETED link is a safe no-op inside it.
          try {
            await recordPosPaymentLinkSale(posPaymentLink, { source: 'webhook', sessionId: session.id });
          } catch (recErr: any) {
            // Re-throw so the outer handler try/catch marks the event FAILED and returns 500,
            // letting Stripe retry -- and the reconciliation cron is the additional backstop.
            console.error(`[pos] Failed to record POS payment link sale for link=${stripePaymentLinkId} session=${session.id}:`, recErr);
            throw recErr;
          }
        } else {
          // Diagnostic logging added after a real live sale (2026-07-22, plink_1Tw4DoLIWHQCHu75vBTfy2Ly,
          // PaymentIntent pi_3Tw4ESLIWHQCHu7505o8jWp4) went silent right here with zero log output --
          // we could not tell afterward whether this branch was ever reached. Money was captured by
          // Stripe but FindA.Sale never recorded the sale. This makes that failure mode visible.
          console.error(`[pos] checkout.session.completed for payment_link=${stripePaymentLinkId} but no matching POSPaymentLink row exists in the DB -- sale may be STRANDED (Stripe captured the charge, FindA.Sale never recorded it). Session: ${session.id}`);
        }
      }

      // Cart Checkout: multi-item shopper purchase via CartDrawer
      if (session.metadata?.type === 'cart_checkout' && session.metadata?.itemIds) {
        const cartItemIds = session.metadata.itemIds.split(',').filter(Boolean);
        const cartSaleId = session.metadata.saleId ?? null;
        const cartBuyerUserId = session.metadata.buyerUserId ?? null;
        // Direct-charges migration (2026-08-08): read back the routing decision recorded on
        // the Session at creation time (createCartCheckoutSession) — chargeType must be set
        // once at charge-creation time, never inferred after the fact.
        const cartChargeType = session.metadata.chargeType === 'DIRECT' ? 'DIRECT' : 'DESTINATION';
        const cartStripeAccountId = session.metadata.stripeAccountId ?? null;

        if (cartItemIds.length > 0) {
          const cartFullySoldOutIds: string[] = [];
          const cartPartialSaleUpdates: { itemId: string; remainingStock: number }[] = [];
          // S1195: populated inside the $transaction below (see cartSale), used after it
          // commits to send the organizer notification that this branch previously lacked.
          let cartSaleOrganizerUserId: string | null = null;
          let cartSaleTitle: string | null = null;
          try {
            await prisma.$transaction(async (tx) => {
              // Fetch items to get current price and confirm they're still AVAILABLE
              const cartItems = await tx.item.findMany({
                where: { id: { in: cartItemIds } },
                select: { id: true, title: true, price: true, status: true, saleId: true },
              });

              // Determine organizer fee rate from sale
              const cartSale = cartSaleId
                ? await tx.sale.findUnique({
                    where: { id: cartSaleId },
                    select: { title: true, organizer: { select: { subscriptionTier: true, userId: true } } },
                  })
                : null;
              const cartFeeRate = getPlatformFeeRate(
                (cartSale?.organizer?.subscriptionTier ?? null) as SubscriptionTier
              );
              // S1195 (2026-08-08, notification-gap dispatch): captured here (inside the tx
              // closure, where cartSale is in scope) and read after the transaction commits,
              // to fire the organizer notification below. Root cause: this branch previously
              // created N Purchase rows for a multi-item cart checkout and NEVER notified the
              // organizer at all -- unlike the single-item payment_intent.succeeded path (see
              // "Notify organizer of payment received" below), which already sends an in-app +
              // email notification (S1183 fix, 2026-07-29).
              cartSaleOrganizerUserId = cartSale?.organizer?.userId ?? null;
              cartSaleTitle = cartSale?.title ?? null;

              // Mark all items SOLD -- ADR-085 Track B Phase 1 Step 4: atomic, race-safe
              // stock decrement replaces the old unconditional updateMany. Collects which
              // items are now fully sold out for the gated hooks fired outside this tx below.
              for (const cartItemId of cartItemIds) {
                try {
                  const { fullySoldOut, remainingStock } = await sellItemUnits(cartItemId, 1, tx);
                  if (fullySoldOut) cartFullySoldOutIds.push(cartItemId);
                  else cartPartialSaleUpdates.push({ itemId: cartItemId, remainingStock });
                } catch (stockErr: any) {
                  if (stockErr instanceof InsufficientStockError) {
                    console.error(`[stripe/cart-checkout] Oversold race on item ${cartItemId}:`, stockErr.message);
                  } else {
                    throw stockErr;
                  }
                }
              }

              // Create a Purchase record per item
              for (const cartItem of cartItems) {
                await tx.purchase.create({
                  data: {
                    itemId: cartItem.id,
                    saleId: cartSaleId ?? cartItem.saleId,
                    userId: cartBuyerUserId,
                    amount: cartItem.price ?? 0,
                    platformFeeAmount: parseFloat(
                      (((cartItem.price ?? 0) * cartFeeRate)).toFixed(2)
                    ),
                    status: 'PAID',
                    source: 'ONLINE',
                    stripePaymentIntentId:
                      typeof session.payment_intent === 'string'
                        ? session.payment_intent
                        : (session.payment_intent as any)?.id ?? null,
                    // Direct-charges migration (2026-08-08): persisted, authoritative charge
                    // shape, carried through from the Session metadata set at creation time.
                    chargeType: cartChargeType,
                    ...(cartChargeType === 'DIRECT' && cartStripeAccountId ? { stripeAccountId: cartStripeAccountId } : {}),
                  },
                });
              }
            });

            // Fire-and-forget: end eBay listings for items now fully sold out (not every
            // item in the cart unconditionally -- ADR-085 Track B Phase 1 Step 4)
            setImmediate(() => {
              Promise.allSettled(
                cartFullySoldOutIds.map((itemId: string) => endEbayListingIfExists(itemId))
              ).catch(() => {});
              Promise.allSettled(
                cartFullySoldOutIds.map((itemId: string) => markShopifyItemSold(itemId))
              ).catch(() => {});
              Promise.allSettled(
                cartFullySoldOutIds.map((itemId: string) => notifyFacebookExportedItemSold(itemId))
              ).catch(() => {});
            });

            // ADR-087 Phase 4: partial sales (not fully sold out) — revise eBay listing
            // quantities for any eBay-linked items in this cart. Fire-and-forget.
            if (cartPartialSaleUpdates.length) {
              setImmediate(() => {
                Promise.allSettled(
                  cartPartialSaleUpdates.map(({ itemId, remainingStock }) =>
                    syncMarketplaceStock(itemId, { fullySoldOut: false, remainingStock })
                  )
                ).catch(() => {});
              });
            }

            console.log(
              `[cart-checkout] Completed — ${cartItemIds.length} items marked SOLD, saleId=${cartSaleId}`
            );

            // S1195 (2026-08-08, notification-gap dispatch): notify the organizer of this
            // cart sale. Root cause: this branch created Purchase rows and marked items SOLD
            // but never notified the organizer -- the organizer only found out about
            // multi-item online sales by opening the app. Mirrors the exact pattern used by
            // the single-item "Notify organizer of payment received" block in
            // payment_intent.succeeded below (same createNotification() from
            // lib/notificationService.ts, sendEmail: true, same outcome logging shape).
            if (cartSaleOrganizerUserId) {
              console.log(
                `[PaymentNotification] Attempting payment_received notification for cart checkout session ${session.id} (organizerUserId=${cartSaleOrganizerUserId}, items=${cartItemIds.length})`
              );
              createNotification({
                userId: cartSaleOrganizerUserId,
                type: 'payment_received',
                title: 'Payment received',
                body: `Payment of $${((session.amount_total ?? 0) / 100).toFixed(2)} received for ${cartItemIds.length} item${cartItemIds.length === 1 ? '' : 's'}${cartSaleTitle ? ` at "${cartSaleTitle}"` : ''}`,
                link: `/organizer/sales/${cartSaleId}`,
                channel: 'OPERATIONAL',
                sendEmail: true,
              }).then(() => {
                console.log(
                  `[PaymentNotification] createNotification succeeded for cart checkout session ${session.id} (organizerUserId=${cartSaleOrganizerUserId})`
                );
              }).catch((err) => {
                console.error(
                  `[PaymentNotification] createNotification failed for cart checkout session ${session.id} (organizerUserId=${cartSaleOrganizerUserId}):`,
                  err instanceof Error ? (err.stack || err.message) : err
                );
              });
            } else {
              console.error(
                `[PaymentNotification] Skipped payment_received notification for cart checkout session ${session.id} -- ` +
                `organizer.userId did not resolve (saleId=${cartSaleId ?? 'null'})`
              );
            }
          } catch (cartErr) {
            // P0 fix (2026-08-07): Purchase-row creation for this cart runs inside a
            // prisma.$transaction (see above), so a throw here means Stripe already captured
            // payment but the transaction rolled back cleanly -- no Purchase rows, no stock
            // decrement. Previously this was only logged: buyer paid, organizer never saw the
            // sale, and (no rethrow, so still a 200 to Stripe) nothing retried it.
            console.error('[cart-checkout] Webhook handler error:', cartErr);
            try {
              Sentry.captureException(cartErr instanceof Error ? cartErr : new Error(String(cartErr)), {
                tags: { area: 'cart-checkout-purchase-creation' },
                extra: {
                  checkoutSessionId: session.id,
                  amountTotal: session.amount_total,
                  itemIds: cartItemIds,
                  saleId: cartSaleId,
                },
              });
            } catch {
              // Sentry may not be initialized -- silently continue
            }
          }
        }
      }

      break;
    }
    case 'charge.succeeded': {
      // Hold-to-Pay Phase 2: Handle successful charge for hold invoices.
      // Recording logic lives in holdInvoicePaymentRecorder.ts (payments fix, 2026-08-03)
      // -- shared with invoiceExpiryJob's STRANDED-PAID reconcile backstop so the two
      // callers can never diverge. See that file's header comment for full context.
      const charge = event.data.object;
      if (charge.payment_intent) {
        const paymentIntent = await stripe().paymentIntents.retrieve(charge.payment_intent as string);
        if (paymentIntent.metadata?.invoiceId) {
          const invoiceId = paymentIntent.metadata.invoiceId;
          // LOCKED DECISION #1: Calculate organizer payout (total amount - platform fee - Stripe fee)
          const stripeFeeAmount = (charge.amount - (charge.amount - (charge.amount_refunded || 0))) / 100; // convert from cents
          await markHoldInvoicePaid(invoiceId, paymentIntent.id, {
            source: 'webhook',
            chargeId: charge.id,
            stripeFeeAmountCents: Math.round(stripeFeeAmount * 100),
          });
        }
      }
      break;
    }
    case 'charge.refunded': {
      // Handle refunded charge — update all purchases to REFUNDED status
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId = charge.payment_intent as string | undefined;
      if (paymentIntentId) {
        try {
          // Notification-gap fix (S1195, 2026-08-08): a refund issued OUTSIDE app code --
          // e.g. directly from the Stripe Dashboard, or any future refund path that doesn't
          // go through executeVerifiedRefund -- previously only flipped Purchase.status here.
          // The buyer got ZERO notification (no email, no in-app row), unlike the app-initiated
          // paths (createRefund / disputeController), which both already email + in-app notify
          // via executeVerifiedRefund + sendRefundConfirmationEmail.
          // Distinguishing signal: executeVerifiedRefund sets Purchase.refundInitiatedBy
          // ('organizer' | 'admin' | 'dispute') in the SAME db write that sets status=REFUNDED,
          // and that write happens synchronously right after the Stripe refund call succeeds --
          // strictly BEFORE Stripe's async charge.refunded webhook can arrive. So
          // refundInitiatedBy IS NULL at this point is a reliable signal that this specific
          // Purchase was never routed through an in-app refund path and has not been notified.
          const purchasesToNotify = await prisma.purchase.findMany({
            where: { stripePaymentIntentId: paymentIntentId, refundInitiatedBy: null, status: { not: 'REFUNDED' } },
            select: {
              id: true,
              amount: true,
              userId: true,
              user: { select: { email: true, name: true } },
              item: { select: { title: true } },
              sale: { select: { organizer: { select: { businessName: true } } } },
            },
          });

          const result = await prisma.purchase.updateMany({
            where: { stripePaymentIntentId: paymentIntentId },
            data: { status: 'REFUNDED' },
          });
          console.log(`[stripe] charge.refunded: updated ${result.count} purchase(s) for PI ${paymentIntentId} to REFUNDED`);

          if (purchasesToNotify.length > 0) {
            // Best-effort per-purchase refund amount: charge.amount_refunded is the TOTAL
            // refunded on the charge so far (cents) -- Stripe does not expose how that splits
            // across multiple Purchase rows sharing one PI (multi-item cart checkout). Split
            // evenly as the best available approximation; the common single-purchase-per-PI
            // case gets the exact amount. Falls back to the purchase's own amount if Stripe
            // didn't report a refunded total for some reason.
            const totalRefundedCents = charge.amount_refunded ?? 0;
            const perPurchaseAmount = totalRefundedCents > 0
              ? (totalRefundedCents / 100) / purchasesToNotify.length
              : null;

            for (const p of purchasesToNotify) {
              const refundAmount = perPurchaseAmount ?? p.amount;

              // Backfill refund-history fields this raw-webhook path never set before (only
              // `status` was ever written here) -- payoutController.ts's getRefundHistory reads
              // refundedAmount/refundedAt/refundInitiatedBy, and both were previously left null
              // forever for any refund issued this way.
              prisma.purchase.update({
                where: { id: p.id },
                data: {
                  refundedAmount: refundAmount,
                  refundedAt: new Date(),
                  refundInitiatedBy: 'stripe_dashboard',
                },
              }).catch((err) => console.error(`[stripe] charge.refunded: failed to backfill refund-history fields for purchase ${p.id}:`, err));

              // Same buyer-facing confirmation email every other refund path sends.
              sendRefundConfirmationEmail({
                toEmail: p.user?.email,
                buyerName: p.user?.name,
                refundAmount,
                wasCapped: false,
                itemTitle: p.item?.title,
                organizerBusinessName: p.sale?.organizer?.businessName,
              });

              // Same in-app notification shape createRefund uses (email already sent above).
              if (p.userId) {
                createNotification({
                  userId: p.userId,
                  type: 'refund_issued',
                  title: 'Refund issued',
                  body: `A refund of $${refundAmount.toFixed(2)} was issued for "${p.item?.title || 'item'}"`,
                  link: '/shopper/purchases',
                  channel: 'OPERATIONAL',
                  sendEmail: false, // sendRefundConfirmationEmail above already sends the email for this event
                }).catch((err) => console.error('[notification] Failed to create refund_issued notification (dashboard-refund path):', err));
              }
            }
          }
        } catch (err) {
          console.error(`[stripe] charge.refunded: failed to update purchases for PI ${paymentIntentId}:`, err);
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

          const itemList = bundledItems.length > 1
            ? `${bundledItems.length} items`
            : `"${bundledItems[0]?.title}"`;

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
          });

          // Notification-gap fix (S1195 sweep continuation, 2026-08-08): this previously
          // wrote a raw tx.notification.create() inside the transaction above, which made
          // email structurally impossible (the shared createNotification() helpers write
          // through the global `prisma` client, not a $transaction's `tx`). A failed
          // payment on a hold is genuinely time-sensitive -- the shopper's hold is still
          // ticking and they need to know to retry before it expires, not just whenever
          // they next happen to open the app. Moved outside the transaction (fire-and-forget,
          // same pattern as every other post-commit notification in this file) so it can go
          // through the email-capable lib/notificationService.ts helper instead.
          createNotification({
            userId: holdInvoice.shopperUserId,
            type: 'payment_failed',
            title: 'Payment failed',
            body: `Your payment for ${itemList} failed: ${charge.failure_message || 'Unknown error'}. Your holds remain active.`,
            link: `/items/${holdInvoice.itemIds[0]}`,
            channel: 'OPERATIONAL',
            sendEmail: true,
          }).catch((err: unknown) => console.error(`[hold-invoice] Failed to create payment_failed notification for invoice ${invoiceId}:`, err));

          console.log(`[hold-invoice] Payment failed for invoice ${invoiceId} (${bundledItems.length} items): ${charge.failure_message}`);
        }
      }
      break;
    }
    case 'account.updated': {
      // P2-1: Stripe Connect onboarding completion — update stripeOnboarded flag
      const account = event.data.object as any; // Stripe.Account

      if (account.id) {
        // Check if this account has completed onboarding (charges and payouts enabled)
        const isOnboarded = account.charges_enabled && account.payouts_enabled;

        try {
          // BUG FIX (2026-07-08, Patrick-reported flags-not-working investigation):
          // this previously queried stripeConnectAccountId, a legacy column that is
          // NEVER written by any code path in this codebase (confirmed via full-repo
          // grep, 0 writes anywhere) -- the real, actually-used column for Organizer's
          // Connect account id is stripeConnectId (set by createConnectAccount and read
          // by every onboarding/checkout call site). The WHERE clause below could never
          // match a real row, so this webhook silently no-op'd for every Organizer,
          // every time, since the feature was built -- Artifact and Lopez Studio's
          // stripeOnboarded flags were stuck at false despite being live-verified on
          // Stripe. Fixed to match the column actually in use.
          const organizersUpdated = await prisma.organizer.updateMany({
            where: { stripeConnectId: account.id },
            data: { stripeOnboarded: isOnboarded }
          });

          if (organizersUpdated.count > 0) {
            console.log(`[stripe-connect] account.updated: stripeOnboarded set to ${isOnboarded} for ${organizersUpdated.count} organizer(s)`);
          }
        } catch (err) {
          console.error(`[stripe-connect] Failed to update stripeOnboarded for account ${account.id}:`, err);
        }

        // Vendor Booth Payments (2026-07-07, ADR-016/017): EXTEND this existing
        // case with Consignor + VendorBooth dual-lookup — NOT a duplicate case
        // block (a second `case 'account.updated':` in the same switch would be
        // dead/unreachable code; ADR-017 corrected this from the original
        // "write a new case" framing after re-verifying the case already exists).
        // Uses findFirst/updateMany, not findUnique — Consignor.stripeAccountId
        // and VendorBooth.stripeAccountId are NOT @@unique (confirmed via schema
        // read), so the same physical Stripe account could legitimately match
        // more than one row (e.g. Artifact operating as both an Organizer and a
        // VendorBooth). Update whichever table(s) have a match; never assume
        // exactly one.
        try {
          const consignorsUpdated = await prisma.consignor.updateMany({
            where: { stripeAccountId: account.id },
            data: { stripeOnboarded: isOnboarded },
          });
          if (consignorsUpdated.count > 0) {
            console.log(`[stripe-connect] account.updated: stripeOnboarded set to ${isOnboarded} for ${consignorsUpdated.count} consignor(s)`);
          }
        } catch (err) {
          console.error(`[stripe-connect] Failed to update Consignor.stripeOnboarded for account ${account.id}:`, err);
        }

        try {
          const boothsUpdated = await prisma.vendorBooth.updateMany({
            where: { stripeAccountId: account.id },
            data: { stripeOnboarded: isOnboarded },
          });
          if (boothsUpdated.count > 0) {
            console.log(`[stripe-connect] account.updated: stripeOnboarded set to ${isOnboarded} for ${boothsUpdated.count} vendor booth(s)`);
          }
        } catch (err) {
          console.error(`[stripe-connect] Failed to update VendorBooth.stripeOnboarded for account ${account.id}:`, err);
        }
        // ADR-023: Standard-migration cutover. Separate from the stripeOnboarded
        // sync above -- this checks whether `account.id` is a PENDING migration
        // target (a NEW Standard account created by startStandardMigration),
        // and if it's now live, cuts the organizer's real money-routing field
        // (stripeConnectId) over to it. This is the actual cutover moment --
        // log it explicitly since it moves where real payouts land.
        try {
          const isOnboarded2 = account.charges_enabled && account.payouts_enabled;
          const feesPayer = account.controller?.fees?.payer;
          if (isOnboarded2 && feesPayer === 'account') {
            const migratingOrganizer = await prisma.organizer.findFirst({
              where: { pendingStripeMigrationAccountId: account.id },
            });
            if (migratingOrganizer) {
              const oldAccountId = migratingOrganizer.stripeConnectId;
              await prisma.organizer.update({
                where: { id: migratingOrganizer.id },
                data: {
                  stripeConnectId: account.id,
                  stripeAccountType: 'standard',
                  pendingStripeMigrationAccountId: null,
                  stripeOnboarded: true,
                },
              });
              console.log(`[stripe-migration] cutover: organizer ${migratingOrganizer.id} ${oldAccountId} -> ${account.id}`);

              // Fraud-relevant gap fix (2026-08-04): the cutover above silently
              // repoints Organizer.stripeConnectId -- the field that determines
              // where this organizer's real payouts land -- with zero notice to
              // the organizer. Without this, a hijacked/incorrect payout
              // destination would only be discovered once money failed to show
              // up. Same createNotification shape already used for
              // payment_received / refund_issued elsewhere in this file;
              // sendEmail: true because this is a money-routing change, not a
              // routine in-app event. Body intentionally omits the raw Stripe
              // account id and any banking detail.
              createNotification({
                userId: migratingOrganizer.userId,
                type: 'payout_account_updated',
                title: 'Your payout account details changed',
                body: 'Your Stripe Connect account was updated as part of a payout routing migration. If you did not expect this, please check your Stripe dashboard.',
                channel: 'OPERATIONAL',
                sendEmail: true,
              }).catch((err) => console.error(`[stripe-migration] Failed to create payout_account_updated notification for organizer ${migratingOrganizer.id}:`, err));

              if (oldAccountId) {
                const boothsCutOver = await prisma.vendorBooth.updateMany({
                  where: { stripeAccountId: oldAccountId },
                  data: { stripeAccountId: account.id, stripeAccountType: 'standard' },
                });
                if (boothsCutOver.count > 0) {
                  console.log(`[stripe-migration] cutover also applied to ${boothsCutOver.count} vendor booth(s) sharing the old account id`);
                }
              }
            }
          }
        } catch (err) {
          console.error(`[stripe-migration] Failed to process migration cutover for account ${account.id}:`, err);
        }

        // If none of Organizer/Consignor/VendorBooth match: no-op, not an error —
        // an unrelated Stripe account's webhook firing is not a FindA.Sale event.
        // Always return 200 regardless (handled by the shared res.json below);
        // a non-2xx here would cause Stripe to retry indefinitely.
      }
      break;
    }

    case 'payout.paid': {
      // Payout webhooks (2026-08-04): payout.paid/payout.failed are ACCOUNT-level
      // Stripe Connect events -- event.data.object is the Payout, and the connected
      // account id lives on event.account (NOT on the payout object itself, unlike
      // account.updated where event.data.object IS the account). This handler
      // resolves event.account back to an Organizer the same way account.updated
      // resolves account.id -- by matching Organizer.stripeConnectId. See PR notes:
      // whether this event actually reaches this endpoint depends on the Connect
      // webhook subscription configured in the Stripe Dashboard (outside this repo) --
      // this handler is signature-verification-ready (constructEvent above already
      // falls back to STRIPE_CONNECT_WEBHOOK_SECRET) but cannot self-verify Stripe's
      // dashboard subscription list from code.
      const payout = event.data.object as any; // Stripe.Payout
      const connectedAccountId = (event as any).account as string | undefined;

      if (!connectedAccountId) {
        console.warn(`[stripe-connect] payout.paid event ${event.id} has no event.account -- cannot resolve organizer, skipping.`);
        break;
      }

      try {
        const organizer = await prisma.organizer.findFirst({
          where: { stripeConnectId: connectedAccountId },
          select: { id: true, userId: true },
        });

        if (organizer) {
          const amountFormatted = `$${(payout.amount / 100).toFixed(2)} ${(payout.currency || 'usd').toUpperCase()}`;
          const arrival = payout.arrival_date
            ? new Date(payout.arrival_date * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : null;

          createNotification({
            userId: organizer.userId,
            type: 'payout_paid',
            title: 'Your payout has landed',
            body: `Your payout of ${amountFormatted} has been sent to your bank account${arrival ? ` (estimated arrival ${arrival})` : ''}.`,
            link: '/organizer/payouts',
            channel: 'OPERATIONAL',
            sendEmail: true,
          }).catch((err) => console.error(`[stripe-connect] Failed to create payout_paid notification for organizer ${organizer.id}:`, err));
        } else {
          console.warn(`[stripe-connect] payout.paid: no Organizer found for connected account ${connectedAccountId}`);
        }
      } catch (err) {
        console.error(`[stripe-connect] Failed to process payout.paid for account ${connectedAccountId}:`, err);
      }
      break;
    }

    case 'payout.failed': {
      // See payout.paid above for the event.account -> Organizer resolution rationale.
      const payout = event.data.object as any; // Stripe.Payout
      const connectedAccountId = (event as any).account as string | undefined;

      if (!connectedAccountId) {
        console.warn(`[stripe-connect] payout.failed event ${event.id} has no event.account -- cannot resolve organizer, skipping.`);
        break;
      }

      try {
        const organizer = await prisma.organizer.findFirst({
          where: { stripeConnectId: connectedAccountId },
          select: { id: true, userId: true },
        });

        if (organizer) {
          const amountFormatted = `$${(payout.amount / 100).toFixed(2)} ${(payout.currency || 'usd').toUpperCase()}`;
          // failure_message/failure_code only -- never expose raw account/routing numbers.
          const reason = payout.failure_message || payout.failure_code || 'Unknown error -- check your Stripe dashboard for details.';

          createNotification({
            userId: organizer.userId,
            type: 'payout_failed',
            title: 'Your payout failed',
            body: `Your payout of ${amountFormatted} could not be completed: ${reason}. This usually means a bank account problem -- please check your payout details.`,
            link: '/organizer/payouts',
            channel: 'OPERATIONAL',
            sendEmail: true,
          }).catch((err) => console.error(`[stripe-connect] Failed to create payout_failed notification for organizer ${organizer.id}:`, err));
        } else {
          console.warn(`[stripe-connect] payout.failed: no Organizer found for connected account ${connectedAccountId}`);
        }
      } catch (err) {
        console.error(`[stripe-connect] Failed to process payout.failed for account ${connectedAccountId}:`, err);
      }
      break;
    }

    default:
      console.warn(`[stripe] Unhandled event type: ${event.type}`);
  }

  await prisma.processedWebhookEvent.update({
    where: { eventId: idempotencyKey },
    data: { status: 'COMPLETED' },
  }).catch((e) => console.warn(`[webhook] Failed to mark event ${event.id} COMPLETED:`, e));
  res.json({ received: true });
  } catch (handlerErr: any) {
    await prisma.processedWebhookEvent.update({
      where: { eventId: idempotencyKey },
      data: { status: 'FAILED' },
    }).catch((e) => console.warn(`[webhook] Failed to mark event ${event.id} FAILED:`, e));
    console.error(`[webhook] handler threw for event ${event.id} type=${event.type}`, handlerErr);
    return res.status(500).json({ received: false, error: 'handler_failed' });
  }
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
            // stripeConnectId (PART B, 2026-07-28): needed to determine whether this
            // purchase's charge was routed through Connect as a destination charge before
            // any Transfer can be reversed.
            organizer: { select: { userId: true, businessName: true, stripeConnectId: true } }
          }
        },
        item: {
          select: {
            title: true,
            // ADR-020: booth-cart purchases refund against the ITEM's own vendor
            // booth's Standard account, not the platform/organizer account — each
            // booth's leg is its own Direct charge (PaymentIntent) on its own
            // stripeAccountId now, so the refund call must be scoped the same way.
            vendorBooth: { select: { id: true, stripeAccountId: true, stripeAccountType: true, vendorName: true } },
          },
        },
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
    const refundAmount = purchase.amount;
    const wasCapped = false;

    // Refund History (2026-07-29): 'organizer' vs 'admin' mirrors the SAME role check this
    // endpoint already ran above (hasOrganizerRole gates the own-sale ownership check just
    // above; a pure admin with no organizer role skips it). A user with both roles is
    // recorded as 'organizer' since that's the branch whose ownership check actually ran.
    const initiatedBy: 'organizer' | 'admin' = hasOrganizerRole ? 'organizer' : 'admin';

    // Money movement — the PAID-status check, payment-intent-exists check, 30-day window,
    // the PAID->REFUNDING TOCTOU compare-and-swap claim + idempotency key, the booth-cart-vs
    // destination-charge Stripe call branching, the STRIPE_REFUND_LIVE_CLAWBACK-gated
    // organizer clawback, the vendor-booth notification, and the hub-owner Transfer reversal
    // all now live in executeVerifiedRefund (services/refundService.ts) — extracted 2026-07-29
    // so disputeController.ts's updateDisputeStatus can share the exact same, already-hardened
    // Stripe path instead of only updating a status string. Moved, not rewritten: this
    // endpoint's behavior for existing callers is unchanged.
    try {
      await executeVerifiedRefund(purchaseId, refundAmount, initiatedBy);
    } catch (refundErr) {
      if (refundErr instanceof RefundError) {
        return res.status(refundErr.statusCode).json({ message: refundErr.message, ...(refundErr.details || {}) });
      }
      throw refundErr;
    }

    // Restore item to AVAILABLE if it exists
    if (purchase.itemId) {
      await prisma.item.update({
        where: { id: purchase.itemId },
        data: { status: 'AVAILABLE' }
      });
    }

    // Send confirmation email to shopper (shared helper — see refundService.ts;
    // fire-and-forget, same as before this extraction)
    sendRefundConfirmationEmail({
      toEmail: purchase.user?.email,
      buyerName: purchase.user?.name,
      refundAmount,
      wasCapped,
      itemTitle: purchase.item?.title,
      organizerBusinessName: purchase.sale?.organizer?.businessName,
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
        body: `A refund of $${refundAmount.toFixed(2)} was issued for "${purchase.item?.title || 'item'}"`,
        link: '/shopper/purchases',
        channel: 'OPERATIONAL',
        sendEmail: false, // sendRefundConfirmationEmail above already sends the email for this event
      }).catch((err) => console.error('[notification] Failed to create refund_issued notification:', err));
    }

    res.json({
      message: 'Refund issued successfully',
      refundAmount,
      wasCapped,
      originalAmount: purchase.amount
    });
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
      process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
      process.env.STRIPE_TEAMS_MONTHLY_PRICE_ID,
    ].filter(Boolean) as string[];
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
    // Tax collection intentionally OFF until FindA.Sale registers in nexus states (Patrick decision S1006)
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
    // Tax collection intentionally OFF until FindA.Sale registers in nexus states (Patrick decision S1006)
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
      payment_intent_data: {
        metadata: {
          saleId: id,
          type: 'ALA_CARTE',
        },
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

// POST /api/stripe/test-transaction
// Runs a test payment through Stripe test key to verify POS is working.
// Auto-checks live_pos in the sale progress checklist on success.
export const testTransaction = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer access required' });
    }

    const { saleId, amount, paymentMethod } = req.body as {
      saleId?: string;
      amount?: number;
      paymentMethod?: 'terminal' | 'payment-link' | 'direct';
    };

    if (!saleId || typeof saleId !== 'string') {
      return res.status(400).json({ message: 'saleId is required' });
    }
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ message: 'amount must be a positive number' });
    }
    if (!paymentMethod || !['terminal', 'payment-link', 'direct'].includes(paymentMethod)) {
      return res.status(400).json({ message: 'paymentMethod must be terminal, payment-link, or direct' });
    }

    // Verify sale ownership
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { organizer: true },
    });
    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    if (sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'You do not own this sale' });
    }

    const testStripe = getTestStripe();
    const amountCents = Math.round(amount * 100);

    // Fee based on organizer tier
    const feeRate = getPlatformFeeRate(sale.organizer.subscriptionTier as SubscriptionTier);
    const platformFeeAmount = Math.round(amountCents * feeRate);
    const netAmount = (amountCents - platformFeeAmount) / 100;

    // Create and immediately confirm a test PaymentIntent
    // Test keys allow confirm_payment_intent with pm_card_visa synchronously
    const paymentIntent = await testStripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      payment_method: 'pm_card_visa',
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      metadata: {
        saleId,
        source: 'TEST',
        paymentMethod,
        organizerId: sale.organizer.id,
      },
    });

    // Record the test purchase
    const purchase = await prisma.purchase.create({
      data: {
        saleId,
        amount,
        platformFeeAmount: platformFeeAmount / 100,
        stripePaymentIntentId: paymentIntent.id,
        status: 'PAID',
        source: 'POS',
        isTestTransaction: true,
      },
    });

    return res.json({
      success: true,
      transactionId: purchase.id,
      stripePaymentIntentId: paymentIntent.id,
      amount,
      platformFeeAmount: platformFeeAmount / 100,
      netAmount,
      checklistAutoUpdated: true,
      message: 'Test transaction successful. live_pos task will auto-check on next checklist load.',
    });
  } catch (error: any) {
    console.error('[test-transaction] error:', error);
    return res.status(500).json({ message: 'Test transaction failed', details: error.message });
  }
};

export const testCheckoutSession = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer access required' });
    }

    const { saleId, type } = req.body as {
      saleId?: string;
      type?: 'standard' | 'auction';
    };

    if (!saleId || typeof saleId !== 'string') {
      return res.status(400).json({ message: 'saleId is required' });
    }
    if (!type || !['standard', 'auction'].includes(type)) {
      return res.status(400).json({ message: 'type must be standard or auction' });
    }

    // Verify sale ownership
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { organizer: true },
    });
    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    if (sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'You do not own this sale' });
    }

    const testStripe = getTestStripe();
    const productName = type === 'auction' ? 'Test Auction Checkout — $1.00' : 'Test Online Checkout — $1.00';

    const session = await testStripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: productName,
            description: 'This is a test transaction. No real money moves and your inventory will not change.',
          },
          unit_amount: 100, // $1.00
        },
        quantity: 1,
      }],
      metadata: {
        isTestTransaction: 'true',
        saleId,
        organizerId: sale.organizer.id,
        type,
      },
      success_url: `${process.env.FRONTEND_URL}/organizer/plan/${saleId}?testCheckout=success&type=${type}`,
      cancel_url: `${process.env.FRONTEND_URL}/organizer/plan/${saleId}`,
    });

    // Generate QR code URL
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(session.url!)}`;

    return res.status(200).json({
      url: session.url,
      qrCodeUrl,
    });
  } catch (error: any) {
    console.error('[test-checkout-session] error:', error);
    return res.status(500).json({ message: 'Test checkout session creation failed', details: error.message });
  }
};

export const testInAppPayment = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer access required' });
    }

    const { saleId } = req.body as { saleId?: string };

    if (!saleId || typeof saleId !== 'string') {
      return res.status(400).json({ message: 'saleId is required' });
    }

    // Verify sale ownership
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { organizer: true },
    });
    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    if (sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'You do not own this sale' });
    }

    const testStripe = getTestStripe();

    // Create and confirm a $1 PaymentIntent server-side
    const paymentIntent = await testStripe.paymentIntents.create({
      amount: 100, // $1.00
      currency: 'usd',
      payment_method: 'pm_card_visa',
      confirm: true,
      metadata: {
        isTestTransaction: 'true',
        saleId,
        source: 'in_app_test',
      },
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    });

    // DO NOT create a Purchase record — frontend calls updateTask directly
    return res.json({ success: true });
  } catch (error: any) {
    console.error('[test-in-app-payment] error:', error);
    return res.status(500).json({ message: 'In-app payment test failed', details: error.message });
  }
};

// Creates an unconfirmed $1 test PaymentIntent and returns clientSecret so the
// organizer can experience the full Stripe Elements form (the real shopper checkout UI).
export const testInAppIntent = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer access required' });
    }

    const { saleId } = req.body as { saleId?: string };
    if (!saleId || typeof saleId !== 'string') {
      return res.status(400).json({ message: 'saleId is required' });
    }

    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { organizer: true },
    });
    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    if (sale.organizer.userId !== req.user.id) {
      return res.status(403).json({ message: 'You do not own this sale' });
    }

    const testStripe = getTestStripe();

    // Create an UNconfirmed PaymentIntent — organizer completes it via Stripe Elements
    const paymentIntent = await testStripe.paymentIntents.create({
      amount: 100, // $1.00
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
        isTestTransaction: 'true',
        saleId,
        source: 'in_app_ui_test',
      },
    });

    return res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error: any) {
    console.error('[test-in-app-intent] error:', error);
    return res.status(500).json({ message: 'Could not create test payment session', details: error.message });
  }
};

// POST /api/stripe/create-cart-checkout-session
// Shopper multi-item cart checkout via Stripe Checkout.
// Accepts { itemIds: string[] }. All items must belong to the same sale.
// Creates a Stripe Checkout Session and returns { url }.
// On completion, the webhook handler (checkout.session.completed, type='cart_checkout')
// marks all items SOLD and creates Purchase records.
export const createCartCheckoutSession = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { itemIds } = req.body as { itemIds?: string[] };
    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ error: 'itemIds must be a non-empty array' });
    }
    if (itemIds.length > 50) {
      return res.status(400).json({ error: 'Cart cannot exceed 50 items' });
    }

    // Fetch all items with sale + organizer Stripe account in one query
    const items = await prisma.item.findMany({
      where: { id: { in: itemIds } },
      select: {
        id: true,
        title: true,
        price: true,
        status: true,
        saleId: true,
        sale: {
          select: {
            id: true,
            title: true,
            organizerId: true,
            organizer: {
              select: {
                stripeConnectId: true,
                subscriptionTier: true,
                userId: true,
              },
            },
          },
        },
      },
    });

    // Verify all requested items were found
    if (items.length !== itemIds.length) {
      const foundIds = new Set(items.map((i) => i.id));
      const missing = itemIds.filter((id) => !foundIds.has(id));
      return res.status(404).json({ error: `Items not found: ${missing.join(', ')}` });
    }

    // Validate all items belong to the same sale
    const saleIds = [...new Set(items.map((i) => i.saleId).filter(Boolean))];
    if (saleIds.length !== 1) {
      return res.status(400).json({ error: 'All cart items must belong to the same sale' });
    }
    const saleId = saleIds[0]!;
    const organizer = items[0].sale?.organizer;

    // S1072/S1076 Finding #4: collusion/wash-trade guard — identity-grade device/card fingerprint match.
    // Sole source of truth for self-dealing + shared-device/shared-card on this endpoint (matches
    // placeHold/placeBid/createPaymentIntent, all fixed the same way this session) -- the ad-hoc
    // organizer-self-check that used to live here was removed so a FraudSignal row always gets
    // written and the wash-trade case (2 distinct colluding accounts) is caught here too, which the
    // old ad-hoc check never covered.
    try {
      await assertCheckoutAllowed({
        buyerUserId: req.user.id,
        saleId,
        itemId: items[0].id,
        prisma,
        context: 'createCartCheckoutSession',
      });
    } catch (guardError) {
      if (guardError instanceof CheckoutGuardError) {
        return res.status(403).json({ error: guardError.message });
      }
      throw guardError;
    }

    // Validate all items are AVAILABLE
    const unavailable = items.filter((i) => i.status !== 'AVAILABLE');
    if (unavailable.length > 0) {
      return res.status(409).json({
        error: `Some items are no longer available: ${unavailable.map((i) => i.title).join(', ')}`,
      });
    }

    // Validate all items have a price
    const noPriceItems = items.filter((i) => i.price == null || i.price <= 0);
    if (noPriceItems.length > 0) {
      return res.status(400).json({
        error: `Some items have no price set: ${noPriceItems.map((i) => i.title).join(', ')}`,
      });
    }

    // Build Stripe line_items (price in cents)
    const lineItems = items.map((item) => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.title.substring(0, 127), // Stripe 128-char limit
        },
        unit_amount: Math.round((item.price as number) * 100),
      },
      quantity: 1,
    }));

    const stripeConnectId = organizer?.stripeConnectId;
    const tier = (organizer?.subscriptionTier ?? null) as SubscriptionTier;
    const feeRate = getPlatformFeeRate(tier);

    // Compute application_fee_amount across all items (summed)
    const totalCents = items.reduce((sum, i) => sum + Math.round((i.price as number) * 100), 0);
    const platformFeeAmount = Math.round(totalCents * feeRate);

    const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || process.env.FRONTEND_URL || 'https://finda.sale';
    const successUrl = `${frontendUrl}/sales/${saleId}?checkout=success`;
    const cancelUrl = `${frontendUrl}/sales/${saleId}`;

    // Apply Connect routing if organizer has a valid Stripe Connect account
    const shouldUseConnect = stripeConnectId && !stripeConnectId.startsWith('acct_test_');
    // Direct-charges migration (2026-08-08): staged-rollout routing decision — live Stripe
    // eligibility check + allowlist gate, see stripeConnectService.shouldUseDirectCharge.
    const cartOrganizerId = items[0].sale?.organizerId ?? null;
    const useDirect = shouldUseConnect && cartOrganizerId
      ? await shouldUseDirectCharge(cartOrganizerId, stripeConnectId)
      : false;

    const baseSessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        type: 'cart_checkout',
        itemIds: itemIds.join(','),
        saleId,
        buyerUserId: req.user.id,
        // Direct-charges migration (2026-08-08): threaded through to the async
        // checkout.session.completed webhook handler so every Purchase row created there
        // gets the correct persisted chargeType/stripeAccountId — chargeType is set once
        // here, at charge-creation time, never inferred later.
        chargeType: useDirect ? 'DIRECT' : 'DESTINATION',
        ...(useDirect ? { stripeAccountId: stripeConnectId! } : {}),
      },
    };

    // Direct-charges migration (2026-08-08): a Direct charge lives on the connected account
    // itself — drop on_behalf_of/transfer_data (there is no platform-side Transfer) and route
    // the Session create call itself to the connected account via the { stripeAccount }
    // request option. Destination-charge shape (else branch) is UNCHANGED.
    const connectParams = useDirect
      ? {
          payment_intent_data: {
            application_fee_amount: platformFeeAmount,
          },
        }
      : shouldUseConnect
        ? {
            payment_intent_data: {
              application_fee_amount: platformFeeAmount,
              on_behalf_of: stripeConnectId,
              transfer_data: { destination: stripeConnectId },
            },
          }
        : {};

    const sessionCreateOptions = useDirect ? { stripeAccount: stripeConnectId! } : undefined;

    let session;
    try {
      session = await stripe().checkout.sessions.create({ ...baseSessionParams, ...connectParams }, sessionCreateOptions);
    } catch (connectErr: any) {
      // Direct-charges migration (2026-08-08): the old silent platform-absorb fallback that
      // used to live here (retrying checkout.sessions.create(baseSessionParams) with ZERO
      // Connect params on insufficient_capabilities_for_transfer) has been REMOVED outright —
      // it captured the charge on the PLATFORM account while the organizer received nothing.
      // This applies regardless of Direct/Destination routing: a Connect-routing failure now
      // always blocks cleanly instead of ever falling through to an un-routed session.create
      // call. Same 409 pattern as createPaymentIntent's sellerAccountUnusable branch above.
      if (
        shouldUseConnect &&
        (connectErr.code === 'insufficient_capabilities_for_transfer' ||
          connectErr.message?.includes('insufficient_capabilities_for_transfer') ||
          connectErr.message?.includes('does not have the necessary capabilities'))
      ) {
        console.warn(
          `[cart-checkout] Seller account ${stripeConnectId} cannot receive funds (${connectErr.code || connectErr.message}); blocking checkout with friendly message`
        );
        return res.status(409).json({
          message: "This seller isn't set up to accept online payments yet. Please contact the organizer to arrange your purchase.",
          code: 'SELLER_PAYMENTS_UNAVAILABLE',
        });
      }
      throw connectErr;
    }

    if (!session.url) {
      return res.status(500).json({ error: 'Failed to create checkout session' });
    }

    return res.json({ url: session.url });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[cart-checkout] Error creating cart checkout session:', msg);
    return res.status(500).json({ error: 'Failed to create checkout session', details: msg });
  }
};
