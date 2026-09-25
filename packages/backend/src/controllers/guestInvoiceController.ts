/**
 * Guest Invoice Controller (2026-09-16)
 *
 * Organizer-initiated, one-off, emailed invoice -- NO pre-existing ItemReservation/hold
 * and NO pre-existing FindA.Sale account required on the recipient's side. This is the
 * gap every existing invoice path left open: sendHoldInvoice (posController.ts) and
 * markSoldAndCreateInvoice (reservationController.ts) both require a real ItemReservation,
 * which requires the item to already be a live catalog listing AND the shopper to already
 * have an account and have placed the hold themselves. There is no organizer-side "create
 * a hold/invoice for someone who has never used FindA.Sale" entry point anywhere else.
 *
 * Reuses the exact same building blocks the POS invoice family already uses rather than
 * inventing a parallel payment path:
 *   - createHoldInvoiceSquareCheckout / generateHoldInvoiceId (holdInvoiceSquareCheckoutHelper.ts)
 *     for the Square Payment Link itself -- the SAME helper sendHoldInvoice's card/balance-due
 *     leg and markSoldAndCreateInvoice already call. Stripe is NOT used: Stripe was fully
 *     decommissioned platform-wide on 2026-09-12 (see posController.ts's own "Stripe removal"
 *     comments) -- every live payment path in this codebase is Square-only now, so this
 *     controller never attempts a Stripe branch at all.
 *   - HoldInvoice as the payment/record model, with a nullable shopperUserId + guestEmail/
 *     guestName (2026-09-16 migration) when the recipient has no FindA.Sale account -- mirrors
 *     the already-shipped Purchase.userId(nullable)/buyerEmail/guestName pattern used today by
 *     POS walk-ins and online guest checkout (squarePaymentController.ts).
 *   - markHoldInvoicePaid (holdInvoicePaymentRecorder.ts), reached via the EXACT SAME Square
 *     webhook path every other Square-processed HoldInvoice already uses (squareWebhookController.ts's
 *     syncSquarePaymentStatus matches on HoldInvoice.squareOrderId) -- so payment confirmation,
 *     the organizer's "Payment received" notification+email, XP, stock/Purchase bookkeeping all
 *     flow through the SAME single source of truth every other hold invoice uses. Nothing new
 *     was built for that half of the flow; holdInvoicePaymentRecorder.ts was made null-safe for
 *     a guest shopperUserId (see that file's own comments) so it keeps working unmodified here.
 *   - transactionalEmailService (Resend rail) for the emailed payable link -- never the Gmail
 *     bulk-outreach rail (lib/emailService.ts).
 *
 * Guest UX (deliberate, simplest-safe option): a guest recipient NEVER logs into FindA.Sale.
 * They get one email with a Square-hosted Checkout link and pay there -- full stop. No
 * FindA.Sale account, no /my-invoices page, nothing shopper-facing to build or secure for
 * them. Confirmed safe by reading every shopper-facing invoice surface: getMyInvoices
 * (reservationController.ts) filters `where: { shopperUserId: req.user.id }`, so a null
 * shopperUserId invoice is structurally invisible there; getInvoiceDetails requires
 * `req.user` (401 with no session) and its authorization check
 * (`invoice.shopperUserId === req.user.id`) degrades to a safe `false` for a null
 * shopperUserId, never a crash. Nothing shopper-facing needed to change.
 *
 * Tier gate: PRO or TEAMS only (matches Patrick's ask -- "gated feature to pro or
 * something"). Uses the exact inline `organizer.subscriptionTier !== X` + 403 pattern
 * workspaceController.ts's TEAMS-only createWorkspace already uses for a hard feature gate
 * -- not the numeric TIER_LIMIT_EXCEEDED/409 pattern (that one is for a *countable resource*
 * limit like concurrent sales, which this isn't).
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { createNotification } from '../lib/notificationService';
import { calculateInclusiveCommissionCents, SubscriptionTier } from '../utils/feeCalculator'; // inclusive-fee migration (2026-09-24, Patrick ruling): guest invoice is a hosted Square checkout link completed by the buyer remotely -- ONLINE channel
import { transactionalEmailService } from '../lib/transactionalEmailService';
import { resolveOrganizerOrTeamMember } from '../utils/posAuth';
import { createHoldInvoiceSquareCheckout, generateHoldInvoiceId } from '../services/holdInvoiceSquareCheckoutHelper';
import { SquareOnboardingIncompleteError } from '../services/squarePaymentService';
import { getDefaultAddress, findGuestPromotionAddress } from '../services/addressService';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ZIP_RE = /^\d{5}(-\d{4})?$/; // same US-ZIP shape squarePaymentController.ts's shipping capture already validates against
const MIN_TOTAL_CENTS = 50; // Square's own per-charge floor -- mirrors squarePaymentController.ts's $0.50 item-price floor.
const DEFAULT_EXPIRY_DAYS = 7;
const MAX_EXPIRY_DAYS = 30;

interface GuestInvoiceLineItem {
  title: string;
  amount: number; // dollars
}

function isProOrAbove(tier: string | null): boolean {
  return tier === 'PRO' || tier === 'TEAMS' || tier === 'ENTERPRISE';
}

/**
 * GET /api/guest-invoices/lookup-recipient?email=...
 * Organizer-facing, PRO/TEAMS-gated (same as the send endpoint): does this email already
 * belong to a FindA.Sale account, and if so, what phone/address (if any) is on file?
 * Drives the send-invoice form's auto-fill -- it needs this BEFORE the organizer hits
 * Send, not just at submit time.
 *
 * ADR-126 (2026-09-16): address auto-fill added. Prefers that account's saved default
 * SHIP_TO Address; when there isn't one, falls back to the quiet guest-to-account
 * promotion (ADR-126 §4/§9.5, Patrick's call -- pre-fill only, never a proactive prompt)
 * by looking up that same email's most recent guest Purchase/HoldInvoice address. Either
 * way this is autofill ONLY -- the organizer can still overwrite any field for this one
 * invoice, and nothing here writes a new Address row (this invoice's own shipping fields
 * are a fresh, immutable per-invoice snapshot, same as always).
 */
export const lookupRecipientForInvoice = async (req: AuthRequest, res: Response) => {
  try {
    // No processor required to look up an email -- this is read-only, not money-moving.
    // An organizer mid-Square-onboarding should still be able to fill out the rest of the
    // form; the actual send below still requires it via the default requireStripe: true.
    const organizer = await resolveOrganizerOrTeamMember(req, res, { requireStripe: false });
    if (!organizer) return;

    if (!isProOrAbove(organizer.subscriptionTier)) {
      return res.status(403).json({ message: 'PRO feature', code: 'TIER_REQUIRED', requiredTier: 'PRO' });
    }

    const email = typeof req.query.email === 'string' ? req.query.email.trim().toLowerCase() : '';
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ message: 'A valid email is required' });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, phone: true },
    });

    // ADR-126 address auto-fill: a real saved default address always wins over the
    // guest-promotion fallback. Both are optional -- most matched accounts today still
    // have neither, exactly as before this ADR.
    let address: {
      recipientName: string | null;
      line1: string;
      line2: string | null;
      city: string;
      state: string;
      zip: string;
      country: string;
    } | null = null;
    let addressSource: 'saved' | 'guest_history' | null = null;

    if (user) {
      const savedAddress = await getDefaultAddress(user.id, 'SHIP_TO');
      if (savedAddress) {
        address = {
          recipientName: savedAddress.recipientName,
          line1: savedAddress.line1,
          line2: savedAddress.line2,
          city: savedAddress.city,
          state: savedAddress.state,
          zip: savedAddress.zip,
          country: savedAddress.country,
        };
        addressSource = 'saved';
      } else {
        const promoted = await findGuestPromotionAddress(email);
        if (promoted) {
          address = {
            recipientName: promoted.recipientName,
            line1: promoted.line1,
            line2: promoted.line2,
            city: promoted.city,
            state: promoted.state,
            zip: promoted.zip,
            country: promoted.country,
          };
          addressSource = 'guest_history';
        }
      }
    }

    return res.json({
      exists: !!user,
      // User.phone is now genuinely shopper-settable (ADR-126 §9.2, via /shopper/settings)
      // -- still returned as-is here, never fabricated.
      phone: user?.phone || null,
      address,
      addressSource,
    });
  } catch (error) {
    console.error('[guestInvoice] lookupRecipientForInvoice error:', error);
    return res.status(500).json({ message: 'Lookup failed' });
  }
};

/**
 * POST /api/guest-invoices
 * Organizer (or TEAMS team member with register access): send a one-off, emailed,
 * payable invoice to any email address -- no hold, no pre-existing catalog item, no
 * requirement that the recipient already have a FindA.Sale account.
 *
 * Body: {
 *   saleId: string;              // which of the organizer's sales this is attributed to
 *   recipientEmail: string;
 *   recipientName?: string;
 *   recipientPhone?: string;     // organizer reference contact -- present on every invoice,
 *                                 // not just guests (Patrick's ask, 2026-09-16 follow-up)
 *   title: string;               // e.g. "Christmas tree (7ft, pre-lit)"
 *   amount: number;               // dollars, the main line item
 *   lineItems?: { title: string; amount: number }[]; // e.g. shipping -- same shape as
 *                                                      // sendHoldInvoice's miscItems
 *   expiryDays?: number;         // default 7, max 30 -- no hold timer to inherit from,
 *                                 // this is a fully organizer-set "TRUST" window
 *   shippingAddressLine1?: string;
 *   shippingAddressLine2?: string;
 *   shippingCity?: string;
 *   shippingState?: string;
 *   shippingZip?: string;        // validated as a US ZIP if provided; not required -- an
 *                                 // invoice for something picked up locally has no shipping
 *   shippingCountry?: string;    // defaults to 'US', same as Purchase.shippingCountry
 * }
 *
 * Shipping/phone (2026-09-16 follow-up dispatch): present and fillable on EVERY invoice, not
 * guest-only -- Patrick's own example (a Christmas tree needing a shipping quote) applies
 * whether or not the recipient turns out to have an account. Stored on HoldInvoice using the
 * exact same field names as Purchase's own shipping-destination columns, then copied
 * straight onto the Purchase row(s) markHoldInvoicePaid creates on payment -- so the
 * EXISTING "buy shipping label" button (payoutController.ts's buyShippingLabel) works on an
 * invoice-born order with no further changes. As of ADR-126 (2026-09-16), lookupRecipientForInvoice
 * above now ALSO returns a saved-or-guest-history address for the matched account when one
 * exists, for send-invoice.tsx to pre-fill -- but these fields on THIS endpoint are still
 * always accepted as submitted: the organizer can freely overwrite any pre-filled value,
 * and submitting here never writes back to that account's saved Address. Phone: User.phone
 * IS a real, persisted column, and is now genuinely shopper-settable from Account Settings
 * (ADR-126 §9.2) -- lookupRecipientForInvoice returns it when present for the frontend to
 * pre-fill.
 */
export const createGuestInvoice = async (req: AuthRequest, res: Response) => {
  try {
    const organizer = await resolveOrganizerOrTeamMember(req, res, { requireStripe: true });
    if (!organizer) return; // resolveOrganizerOrTeamMember already sent the response

    // Tier gate: PRO/TEAMS/ENTERPRISE only. SIMPLE organizers keep every hold/POS invoice
    // path they already have -- this specific "email anyone, no account needed" capability
    // is the gated one, per Patrick's ask.
    if (!isProOrAbove(organizer.subscriptionTier)) {
      return res.status(403).json({
        message: 'Emailed one-off invoices are a PRO feature. Upgrade to bill any customer by email -- no hold, no catalog item, and no FindA.Sale account required on their end.',
        code: 'TIER_REQUIRED',
        requiredTier: 'PRO',
        upgradeUrl: '/pricing',
      });
    }

    const {
      saleId,
      recipientEmail,
      recipientName,
      recipientPhone,
      title,
      amount,
      lineItems,
      expiryDays,
      shippingAddressLine1,
      shippingAddressLine2,
      shippingCity,
      shippingState,
      shippingZip,
      shippingCountry,
    } = req.body as {
      saleId?: string;
      recipientEmail?: string;
      recipientName?: string;
      recipientPhone?: string;
      title?: string;
      amount?: number;
      lineItems?: GuestInvoiceLineItem[];
      expiryDays?: number;
      shippingAddressLine1?: string;
      shippingAddressLine2?: string;
      shippingCity?: string;
      shippingState?: string;
      shippingZip?: string;
      shippingCountry?: string;
    };

    if (!saleId || typeof saleId !== 'string') {
      return res.status(400).json({ message: 'saleId is required' });
    }
    if (!recipientEmail || typeof recipientEmail !== 'string' || !EMAIL_RE.test(recipientEmail.trim())) {
      return res.status(400).json({ message: 'A valid recipient email is required' });
    }
    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ message: 'A title/description is required' });
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: 'A valid amount is required' });
    }
    if (lineItems !== undefined) {
      if (!Array.isArray(lineItems) || lineItems.some(
        (li) => !li || typeof li.title !== 'string' || !li.title.trim() || typeof li.amount !== 'number' || !Number.isFinite(li.amount) || li.amount < 0
      )) {
        return res.status(400).json({ message: 'lineItems must be an array of { title, amount }' });
      }
    }
    // Shipping/phone (2026-09-16 follow-up): all optional -- an invoice for something
    // picked up locally has no shipping, and the organizer may not have the customer's
    // phone. Only real-shape validation: a ZIP, if provided, must look like a ZIP.
    if (typeof shippingZip === 'string' && shippingZip.trim() && !ZIP_RE.test(shippingZip.trim())) {
      return res.status(400).json({ message: 'shippingZip must be a valid US ZIP code' });
    }

    const safeExpiryDays = Number.isFinite(expiryDays)
      ? Math.min(Math.max(Math.round(expiryDays as number), 1), MAX_EXPIRY_DAYS)
      : DEFAULT_EXPIRY_DAYS;

    const normalizedEmail = recipientEmail.trim().toLowerCase();
    const normalizedName = typeof recipientName === 'string' && recipientName.trim()
      ? recipientName.trim().slice(0, 200)
      : null;
    const normalizedTitle = title.trim().slice(0, 200);
    const normalizedPhone = typeof recipientPhone === 'string' && recipientPhone.trim()
      ? recipientPhone.trim().slice(0, 30)
      : null;
    // Same optional-field normalization Purchase's own shipping capture uses
    // (squarePaymentController.ts): trim, cap length, undefined (not empty string) when
    // blank so Prisma leaves the column null rather than storing ''.
    const normalizedShipping = {
      shippingAddressLine1: typeof shippingAddressLine1 === 'string' && shippingAddressLine1.trim()
        ? shippingAddressLine1.trim().slice(0, 200) : null,
      shippingAddressLine2: typeof shippingAddressLine2 === 'string' && shippingAddressLine2.trim()
        ? shippingAddressLine2.trim().slice(0, 200) : null,
      shippingCity: typeof shippingCity === 'string' && shippingCity.trim()
        ? shippingCity.trim().slice(0, 100) : null,
      shippingState: typeof shippingState === 'string' && shippingState.trim()
        ? shippingState.trim().slice(0, 50) : null,
      shippingZip: typeof shippingZip === 'string' && shippingZip.trim()
        ? shippingZip.trim() : null,
      // Defaults to 'US' (never null) -- matches Purchase.shippingCountry's own
      // @default("US") behavior; explicit null here would override that column default.
      shippingCountry: typeof shippingCountry === 'string' && shippingCountry.trim()
        ? shippingCountry.trim().slice(0, 2).toUpperCase() : 'US',
    };

    // Confirm the sale is really this organizer's -- HoldInvoice.saleId is a required FK
    // and every downstream reader (notification link, fee-rate context, admin/organizer
    // views) assumes it points at a real sale this organizer owns.
    const sale = await prisma.sale.findFirst({
      where: { id: saleId, organizerId: organizer.id },
      select: { id: true },
    });
    if (!sale) {
      return res.status(404).json({ message: 'Sale not found, or does not belong to you' });
    }

    // Link to a real account if this email already has one -- never silently create an
    // account/password. Case-insensitive match, same normalization User.email already
    // uses elsewhere (lower-cased at signup).
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    const baseAmountCents = Math.round(amount * 100);
    const lineItemsTotalCents = (lineItems ?? []).reduce((sum, li) => sum + Math.round(li.amount * 100), 0);
    const grandTotal = baseAmountCents + lineItemsTotalCents;
    if (grandTotal < MIN_TOTAL_CENTS) {
      return res.status(400).json({ message: `Total must be at least $${(MIN_TOTAL_CENTS / 100).toFixed(2)}` });
    }
    const platformFeeAmount = calculateInclusiveCommissionCents(grandTotal, organizer.subscriptionTier as SubscriptionTier, 'ONLINE');

    const expiresAt = new Date(Date.now() + safeExpiryDays * 24 * 60 * 60 * 1000);

    // Pre-generated id -- same trick holdInvoiceSquareCheckoutHelper.ts documents: Square's
    // paymentNote can only be set at link-creation time, so the HoldInvoice id must exist
    // before the Square call, not after.
    const holdInvoiceId = generateHoldInvoiceId();
    const squareDescription = lineItems && lineItems.length > 0
      ? `${normalizedTitle} + more`.slice(0, 200)
      : normalizedTitle;

    let squareResult;
    try {
      squareResult = await createHoldInvoiceSquareCheckout({
        organizerId: organizer.id,
        holdInvoiceId,
        amountCents: grandTotal,
        description: squareDescription,
        appFeeCents: platformFeeAmount,
      });
    } catch (squareError: any) {
      if (squareError instanceof SquareOnboardingIncompleteError) {
        return res.status(409).json({
          message: "You're not set up to accept online payments yet. Complete Square onboarding in Settings before sending an emailed invoice.",
          code: 'SELLER_PAYMENTS_UNAVAILABLE',
        });
      }
      console.error('[guestInvoice] Square payment link creation failed:', squareError);
      return res.status(400).json({ message: 'Failed to create payment link', error: squareError?.message });
    }

    if (!squareResult.ok) {
      return res.status(402).json({ message: squareResult.message, code: 'SQUARE_PAYMENT_LINK_FAILED' });
    }

    const holdInvoice = await prisma.holdInvoice.create({
      data: {
        id: holdInvoiceId,
        reservationId: null,
        shopperUserId: existingUser?.id ?? null,
        guestEmail: existingUser ? null : normalizedEmail,
        guestName: existingUser ? null : normalizedName,
        recipientPhone: normalizedPhone,
        ...normalizedShipping,
        organizerUserId: organizer.ownerUserId,
        saleId: sale.id,
        itemIds: [], // no catalog item -- ad hoc line item(s), same shape markHoldInvoicePaid
                     // already supports for a miscItems-only invoice (see its own "zero
                     // bundled items" branch).
        totalAmount: grandTotal,
        platformFeeAmount,
        status: 'PENDING',
        expiresAt,
        invoiceMode: 'TRUST', // organizer-set window, not the 15-min in-person QUICK default
        processor: 'SQUARE',
        stripeSessionId: null,
        stripePaymentIntentId: null,
        squarePaymentLinkId: squareResult.paymentLinkId,
        squareOrderId: squareResult.orderId,
        chargeType: null,
        stripeAccountId: null,
      },
    });

    // Email the payable link -- transactional/Resend rail, never Gmail. Mirrors
    // sendHoldInvoice's Square-branch email exactly: check emailResult.sent and surface a
    // non-fatal warning rather than pre-checking suppression separately (suppressionService
    // is already checked INSIDE transactionalEmailService.emails.send as of the 2026-08-25
    // P0 fix -- a second external isHardSuppressed check would be redundant).
    let emailWarning: string | null = null;
    try {
      const { buildEmail } = await import('../services/emailTemplateService');
      const fromEmail = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';

      let itemsList = `<strong>${normalizedTitle}</strong> - $${amount.toFixed(2)}`;
      if (lineItems && lineItems.length > 0) {
        const lineItemsHtml = lineItems
          .map((li) => `<strong>${li.title}</strong> - $${li.amount.toFixed(2)}`)
          .join('<br/>');
        itemsList += '<br/>' + lineItemsHtml;
      }

      const html = buildEmail({
        preheader: `Invoice for $${(grandTotal / 100).toFixed(2)}`,
        headline: `Invoice: ${normalizedTitle}${lineItems && lineItems.length > 0 ? ' + more' : ''}`,
        body: `<p>Hi ${normalizedName ?? 'there'},</p><p>You have a new invoice:</p><p>${itemsList}</p><p><strong>Total: $${(grandTotal / 100).toFixed(2)}</strong></p>`,
        ctaText: 'Pay Now',
        ctaUrl: squareResult.url,
        accentColor: '#10b981',
      });

      const emailResult = await transactionalEmailService.emails.send({
        from: fromEmail,
        to: normalizedEmail,
        subject: `Invoice: ${normalizedTitle}`,
        html,
      });

      if (!emailResult.sent) {
        emailWarning = `Invoice created, but the email could not be delivered (${emailResult.reason ?? 'unknown reason'}). Share the payment link with the customer directly.`;
        console.warn(`[guestInvoice] email not sent (reason=${emailResult.reason}) to ${normalizedEmail}`);
      }
    } catch (emailErr: any) {
      emailWarning = 'Invoice created, but the email failed to send. Share the payment link with the customer directly.';
      console.warn('[guestInvoice] Failed to send invoice email:', emailErr);
    }

    // If the recipient already has a FindA.Sale account, also give them the in-app
    // notification real shopper invoices get (sendHoldInvoice's own 'hold_invoice' shape) --
    // they have an inbox to see it in. A guest (no account) has none, so nothing to do there;
    // the email above is their only channel.
    if (existingUser) {
      try {
        await createNotification({
          userId: existingUser.id,
          type: 'hold_invoice',
          title: 'Invoice Ready',
          body: `You have a new invoice for ${normalizedTitle}. Total: $${(grandTotal / 100).toFixed(2)}`,
          link: squareResult.url,
        });
      } catch (notifErr) {
        console.warn('[guestInvoice] Failed to create invoice notification:', notifErr);
      }
    }

    return res.status(201).json({
      invoiceId: holdInvoice.id,
      status: 'SENT',
      checkoutUrl: squareResult.url,
      totalAmount: grandTotal,
      platformFeeAmount,
      linkedExistingAccount: !!existingUser,
      ...(emailWarning ? { emailWarning } : {}),
    });
  } catch (error) {
    if (error instanceof SquareOnboardingIncompleteError) {
      return res.status(409).json({
        message: "You're not set up to accept online payments yet. Complete Square onboarding in Settings before sending an emailed invoice.",
        code: 'SELLER_PAYMENTS_UNAVAILABLE',
      });
    }
    console.error('[guestInvoice] createGuestInvoice error:', error);
    return res.status(500).json({ message: 'Failed to send invoice' });
  }
};
