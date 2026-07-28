/**
 * Vendor Booth Sale Notification Service (2026-07-28)
 *
 * Closes the last two money-side notification gaps in the booth lifecycle. The lifecycle
 * pass (services/vendorBoothLifecycleNotificationService.ts) covered claim, confirm,
 * reject/cancel, Stripe connect and failed rent. It did NOT cover the two events where
 * money actually moves for a vendor:
 *
 *   1. THEIR ITEM SOLD.  captureBoothCart (controllers/vendorBoothCartController.ts) is the
 *      moment a booth sale completes. It creates Purchase rows, marks items SOLD, fires the
 *      hub-owner Transfer, and then calls receiptService.sendBoothCartReceiptEmail at
 *      vendorBoothCartController.ts :1309 -- which emails the SHOPPER. The vendor whose
 *      goods just sold was told nothing at all, on any channel. A vendor standing at a
 *      market with someone else working the register had no way to know an item sold, for
 *      how much, or what reached them.
 *
 *   2. THEIR SALE WAS REFUNDED.  stripeController.createRefund refunds a booth-cart purchase
 *      against the VENDOR'S OWN connected account (Direct charge, { stripeAccount }), so the
 *      money comes out of the vendor's balance. It emails the shopper a refund confirmation
 *      and told the vendor nothing.
 *
 * Both do TWO things: an in-app Notification row (the existing inbox -- model Notification,
 * services/notificationService.ts createNotification, surfaced by NotificationBell.tsx) and
 * an email. No new notification framework was invented.
 *
 * Structure, rails and gates are copied from vendorBoothLifecycleNotificationService: same
 * buildEmail template, same Resend transactional rail, same escapeHtml, same
 * suppression-then-RESEND_API_KEY ordering in deliverEmail, same "The FindA.Sale Team"
 * sender, same never-throw contract returning { sent, reason } for every skip and failure.
 *
 * FEE HONESTY. The sale email quotes leg.platformFeeCents and leg.hubOwnerShareAmount --
 * the values computeLegFeeSplit produced for THAT leg and that were actually handed to
 * Stripe as application_fee_amount. Nothing is recomputed and no percentage is hardcoded.
 * Re-deriving the platform fee here from getPlatformFeeRate(organizer.subscriptionTier)
 * would read a column the organizer can change between authorize and capture, which is the
 * same class of error as the disclosure that read 10% while the charge was 8%.
 * The hub owner's cut is stated in DOLLARS off the leg, never as a percent: printing
 * VendorBooth.revenueSharePercent would reprint a mutable number that may no longer be the
 * one this sale was charged at.
 * When platformFeeCents is NULL -- every leg captured before its migration -- the email
 * states the gross only and says the fees come out of it, rather than inventing a figure.
 *
 * ISOLATION. Nothing here throws, and every caller invokes it fire-and-forget with a
 * .catch(). A captured payment is real money: notification must never fail, delay or roll
 * back a capture or a refund.
 */

import { buildEmail } from './emailTemplateService';
import { escapeHtml } from './vendorBoothInviteEmailService';
import { transactionalEmailService } from '../lib/transactionalEmailService';
import { suppressionService } from './suppressionService';
import { createNotification } from './notificationService';
import { prisma } from '../lib/prisma';

const FROM_EMAIL = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://finda.sale';

export type BoothSaleNotifyResult = { sent: boolean; reason?: string };

/** Same two gates, same order, as vendorBoothLifecycleNotificationService.deliverEmail:
 *  recipient suppression / blocked-domain policy first, then the RESEND_API_KEY environment
 *  gate (transactionalEmailService returns silently without it, so skipping this check would
 *  report a send that never left the building). Never throws. */
async function deliverEmail(to: string, subject: string, html: string, tag: string): Promise<BoothSaleNotifyResult> {
  try {
    if (await suppressionService.isHardSuppressed(to)) {
      console.log(`[booth-sale] ${tag}: skipping blocked or suppressed address: ${to}`);
      return { sent: false, reason: 'That email address cannot be emailed by FindA.Sale' };
    }
    if (!process.env.RESEND_API_KEY) {
      console.error(`[booth-sale] ${tag}: RESEND_API_KEY not set, email NOT sent`);
      return { sent: false, reason: 'Email is not configured on this server' };
    }
    await transactionalEmailService.emails.send({ from: FROM_EMAIL, to, subject, html });
    console.log(`[booth-sale] ${tag}: email sent to ${to}`);
    return { sent: true };
  } catch (error) {
    console.error(`[booth-sale] ${tag}: email send failed:`, error);
    return { sent: false, reason: 'Could not send the email' };
  }
}

const money = (cents: number): string => (cents / 100).toFixed(2);

/**
 * 1. A booth cart leg was captured -> tell the vendor their goods sold.
 *
 * GRAIN: one call per LEG, never per cart and never per item. A leg IS one vendor's slice of
 * one cart -- one vendorBoothId, one PaymentIntent, one charge, on both the TERMINAL and QR
 * rails (they converge on the same captureBoothCart endpoint). Per-cart would email one
 * vendor about another vendor's goods in a multi-vendor cart; per-item would send three
 * emails for a three-item sale.
 *
 * IDEMPOTENCY: BoothCartLeg.vendorSaleNotifiedAt, claimed with a conditional updateMany
 * (WHERE vendorSaleNotifiedAt IS NULL) BEFORE any email is sent, not a read-then-write. This
 * is deliberately stricter than the lifecycle service's read-the-stamp-then-write-it-last
 * pattern: /capture is explicitly retryable (it releases its CAPTURING lock on every
 * non-success exit path so a genuine partial failure can be retried), and two capture
 * attempts on the same cart could otherwise interleave between the read and the write. The
 * same compare-and-swap idiom already guards the hub-owner Transfer on this very row
 * (stripeTransferId IS NULL -> 'CLAIMING'). A vendor must never get two emails for one sale,
 * so the claim is taken first and the email is sent only by the caller that won it.
 *
 * Fires only AFTER capture succeeds: the leg must be CAPTURED. An authorized-but-uncaptured
 * leg is not a sale, and cancelBoothCart voids those for free.
 */
export async function notifyVendorOfBoothSale(legId: string): Promise<BoothSaleNotifyResult> {
  try {
    const leg = await prisma.boothCartLeg.findUnique({
      where: { id: legId },
      select: {
        id: true,
        cartTransactionId: true,
        vendorBoothId: true,
        amountCents: true,
        platformFeeCents: true,
        hubOwnerShareAmount: true,
        status: true,
        vendorSaleNotifiedAt: true,
        vendorBooth: {
          select: {
            id: true,
            hubId: true,
            boothNumber: true,
            vendorName: true,
            vendorEmail: true,
            userId: true,
            boothToken: true,
            user: { select: { email: true } },
            hub: { select: { name: true, organizer: { select: { businessName: true } } } },
          },
        },
      },
    });

    if (!leg) return { sent: false, reason: 'Cart leg not found' };
    if (leg.status !== 'CAPTURED') return { sent: false, reason: `Leg is ${leg.status}, not CAPTURED, so no sale has completed` };
    if (leg.vendorSaleNotifiedAt) return { sent: false, reason: 'Vendor was already notified about this sale' };

    const booth = leg.vendorBooth;
    if (!booth) return { sent: false, reason: 'Leg has no vendor booth' };

    // Claim the send BEFORE doing anything visible. Losers of the race stop here.
    const claim = await prisma.boothCartLeg.updateMany({
      where: { id: leg.id, vendorSaleNotifiedAt: null },
      data: { vendorSaleNotifiedAt: new Date() },
    });
    if (claim.count !== 1) return { sent: false, reason: 'Vendor was already notified about this sale' };

    // What sold. Read from the Purchase rows captureBoothCart just created -- the durable
    // record of the sale. Items themselves are no longer status RESERVED at this point, so
    // resolveBoothLegItems' filter would not match them. Grouped in JS by the item's own
    // vendorBoothId, the same way receiptService.sendBoothCartReceiptEmail groups a cart.
    const cartPurchases = await prisma.purchase.findMany({
      where: { boothCartTransactionId: leg.cartTransactionId },
      select: { amount: true, item: { select: { title: true, vendorBoothId: true } } },
    });
    const sold = cartPurchases.filter((p) => p.item?.vendorBoothId === booth.id);

    const grossCents = leg.amountCents;
    const hubOwnerShareCents = leg.hubOwnerShareAmount ? Math.round(Number(leg.hubOwnerShareAmount) * 100) : 0;
    // NULL means this leg predates the platformFeeCents column. Do not guess.
    const platformFeeCents: number | null = leg.platformFeeCents ?? null;
    const netCents: number | null =
      platformFeeCents === null ? null : grossCents - platformFeeCents - hubOwnerShareCents;

    const itemCount = sold.length;
    const itemWord = itemCount === 1 ? 'item' : 'items';
    const hubNameRaw = booth.hub?.name || 'the market';
    const organizerNameRaw = booth.hub?.organizer?.businessName || 'the market organizer';
    const boothPath = `/vendor-booth/${booth.boothToken}`;

    // In-app first, so the vendor gets the alert even when the email leg is skipped.
    if (booth.userId) {
      await createNotification(
        booth.userId,
        'vendor_booth',
        `You sold $${money(grossCents)} at Booth ${booth.boothNumber}`,
        netCents !== null
          ? `${itemCount} ${itemWord} sold at Booth ${booth.boothNumber} at ${hubNameRaw}. $${money(netCents)} reaches your Stripe account after the platform fee and the revenue share.`
          : `${itemCount} ${itemWord} sold at Booth ${booth.boothNumber} at ${hubNameRaw}, for $${money(grossCents)} before fees.`,
        boothPath,
        'OPERATIONAL'
      );
    }

    const vendorEmail = booth.user?.email || booth.vendorEmail;
    if (!vendorEmail) return { sent: false, reason: 'No vendor email on file' };

    const vendorName = escapeHtml(booth.vendorName);
    const boothNumber = escapeHtml(booth.boothNumber);
    const hubName = escapeHtml(hubNameRaw);
    const organizerName = escapeHtml(organizerNameRaw);
    const boothUrl = `${FRONTEND_URL}${boothPath}`;

    const itemsHtml = sold.length
      ? `<ul>${sold.map((p) => `<li>${escapeHtml(p.item?.title || 'Item')}: $${(p.amount || 0).toFixed(2)}</li>`).join('')}</ul>`
      : '';

    // Every figure below is read straight off the leg. Nothing is recomputed.
    const breakdownHtml =
      platformFeeCents !== null && netCents !== null
        ? `<p><strong>What this sale came to</strong></p>
        <ul>
          <li>Sold: $${money(grossCents)}</li>
          <li>FindA.Sale fee: $${money(platformFeeCents)}</li>
          ${hubOwnerShareCents > 0 ? `<li>Revenue share to ${organizerName}: $${money(hubOwnerShareCents)}</li>` : ''}
          <li><strong>Reaches your Stripe account: $${money(netCents)}</strong></li>
        </ul>
        <p>Stripe's own card processing fee comes out of that as well, so the amount that lands in your bank will be a little lower.</p>`
        : `<p><strong>Sold: $${money(grossCents)}</strong></p>
        <p>That is what the shopper paid at your booth. The FindA.Sale fee and any revenue share you agreed with ${organizerName} come out of it, along with Stripe's card processing fee, before the rest reaches you. Your booth page shows your current terms.</p>`;

    const html = buildEmail({
      preheader: `${itemCount} ${itemWord} sold at Booth ${boothNumber} at ${hubName}.`,
      headline: `You just made a sale at Booth ${boothNumber}`,
      body: `<p>Hi ${vendorName},</p>
        <p>${itemCount === 1 ? 'An item' : `${itemCount} items`} just sold at Booth ${boothNumber} at ${hubName}.</p>
        ${itemsHtml}
        ${breakdownHtml}
        <p>The money goes to your own Stripe account, not to us and not to ${organizerName}. You do not have to collect anything or invoice anyone.</p>
        <p>If the button does not work, copy this link into your browser:<br />${boothUrl}</p>
        <p>If this sale does not look right, contact ${organizerName} at ${hubName}.</p>
        <p>The FindA.Sale Team</p>`,
      ctaText: 'View Your Booth',
      ctaUrl: boothUrl,
    });

    return await deliverEmail(
      vendorEmail,
      `You sold ${itemCount} ${itemWord} at Booth ${booth.boothNumber}`,
      html,
      'sale'
    );
  } catch (error) {
    console.error(`[booth-sale] notifyVendorOfBoothSale failed for leg ${legId}:`, error);
    return { sent: false, reason: 'Could not send the sale notification' };
  }
}

/**
 * 2. A booth-cart purchase was refunded -> tell the vendor.
 *
 * The refund is taken against the vendor's OWN connected account, so their balance drops.
 * Only the shopper was being told (stripeController.createRefund's confirmation email).
 *
 * IDEMPOTENCY comes from the caller's existing structure rather than a new column, the same
 * way notifyBoothRentChargeFailed relies on the fee-charge row's P2002 claim. createRefund
 * atomically claims the PAID -> REFUNDING transition with a conditional updateMany, and only
 * that single winning caller ever reaches the finalize-to-REFUNDED write this is fired from.
 * A second refund attempt on the same purchase is rejected before it gets near this call.
 */
export async function notifyVendorBoothSaleRefunded(purchaseId: string): Promise<BoothSaleNotifyResult> {
  try {
    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      select: {
        id: true,
        amount: true,
        boothCartTransactionId: true,
        item: {
          select: {
            title: true,
            vendorBooth: {
              select: {
                id: true,
                boothNumber: true,
                vendorName: true,
                vendorEmail: true,
                userId: true,
                boothToken: true,
                user: { select: { email: true } },
                hub: { select: { name: true, organizer: { select: { businessName: true } } } },
              },
            },
          },
        },
      },
    });

    if (!purchase) return { sent: false, reason: 'Purchase not found' };
    if (!purchase.boothCartTransactionId) return { sent: false, reason: 'Not a vendor booth sale' };

    const booth = purchase.item?.vendorBooth;
    if (!booth) return { sent: false, reason: 'This purchase has no vendor booth' };

    const amount = (purchase.amount || 0).toFixed(2);
    const itemTitleRaw = purchase.item?.title || 'An item';
    const hubNameRaw = booth.hub?.name || 'the market';
    const organizerNameRaw = booth.hub?.organizer?.businessName || 'the market organizer';
    const boothPath = `/vendor-booth/${booth.boothToken}`;

    if (booth.userId) {
      await createNotification(
        booth.userId,
        'vendor_booth',
        `A $${amount} sale at Booth ${booth.boothNumber} was refunded`,
        `${itemTitleRaw} was refunded to the shopper. The $${amount} comes back out of your Stripe account, and the fees taken on that sale are returned to you.`,
        boothPath,
        'OPERATIONAL'
      );
    }

    const vendorEmail = booth.user?.email || booth.vendorEmail;
    if (!vendorEmail) return { sent: false, reason: 'No vendor email on file' };

    const vendorName = escapeHtml(booth.vendorName);
    const boothNumber = escapeHtml(booth.boothNumber);
    const itemTitle = escapeHtml(itemTitleRaw);
    const hubName = escapeHtml(hubNameRaw);
    const organizerName = escapeHtml(organizerNameRaw);
    const boothUrl = `${FRONTEND_URL}${boothPath}`;

    const html = buildEmail({
      preheader: `A $${amount} sale at Booth ${boothNumber} was refunded.`,
      headline: `A sale at Booth ${boothNumber} was refunded`,
      body: `<p>Hi ${vendorName},</p>
        <p>${itemTitle}, which sold for $${amount} at Booth ${boothNumber} at ${hubName}, has been refunded to the shopper.</p>
        <p>The $${amount} comes back out of your own Stripe account, because that is where the sale landed in the first place. The FindA.Sale fee and any revenue share taken on that sale are returned to you at the same time, so you are not left paying fees on a sale that was undone.</p>
        <p>The item is back in your booth and can be sold again.</p>
        <p>${organizerName} at ${hubName} issued this refund. If you were not expecting it, contact them directly.</p>
        <p>If the button does not work, copy this link into your browser:<br />${boothUrl}</p>
        <p>The FindA.Sale Team</p>`,
      ctaText: 'View Your Booth',
      ctaUrl: boothUrl,
    });

    return await deliverEmail(
      vendorEmail,
      `A $${amount} sale at Booth ${booth.boothNumber} was refunded`,
      html,
      'refund'
    );
  } catch (error) {
    console.error(`[booth-sale] notifyVendorBoothSaleRefunded failed for purchase ${purchaseId}:`, error);
    return { sent: false, reason: 'Could not send the refund notification' };
  }
}
