import { prisma } from '../lib/prisma';
import * as Sentry from '@sentry/node';
import { SquareClient, SquareEnvironment } from 'square';
import { RefundError } from './refundService'; // SAME error class Stripe's refund path throws -- see file comment below for why this is not redeclared here.
import { notifyVendorBoothSaleRefunded } from './vendorBoothSaleNotificationService';
import { createNotification } from '../lib/notificationService';
import { resolveOrganizerSquareAccessToken, SquareOnboardingIncompleteError } from './squarePaymentService'; // Wave 0.5 (2026-09-07): reuse the SAME token-resolve/refresh seam checkout/POS already use rather than re-implementing it here -- see resolveSquareAccessToken() below.
import { resolveVendorBoothSquareAccessToken, SquareBoothOnboardingIncompleteError } from './squareVendorBoothCartService'; // vendor-booth-cart-checkout dispatch (2026-09-07): resolves the booth's OWN token for a booth-cart Square refund (see the extended purchase.boothCartTransactionId branch below).

/**
 * squareRefundService.ts -- Square-side mirror of refundService.ts's single-choke-point
 * shape (2026-09-07, Wave 1 #4 of the Square-replaces-Stripe migration -- see
 * claude_docs/feature-notes/square-replaces-stripe-architecture-and-scoping-2026-09-07.md,
 * "Wave 1" section, dispatch #4).
 *
 * WHY THIS REUSES RefundError FROM refundService.ts INSTEAD OF DEFINING ITS OWN: every
 * existing caller (stripeController.ts's createRefund, disputeController.ts's
 * updateDisputeStatus, adminController.ts's bulkRefundPurchases) already has a
 * `catch (err) { if (err instanceof RefundError) {...} }` block written against
 * refundService.ts's class. Throwing a second, differently-named error class from this file
 * would silently bypass every one of those catch blocks and fall through to each caller's
 * generic 500 handler -- losing the statusCode/details a caller is supposed to relay to the
 * client. Reusing the SAME class keeps the three call sites' existing catch logic correct
 * for BOTH processors with a one-line branch added at each site (see the "one added branch"
 * changes in stripeController.ts / disputeController.ts / adminController.ts alongside this
 * file), instead of needing a second parallel catch clause everywhere.
 *
 * WHAT DOES NOT NEED A DUAL-FLAG DANCE HERE (real simplification, confirmed via Square's own
 * docs, developer.squareup.com/docs/payments-api/collect-fees/payment-with-app-fee-refund):
 * Stripe's executeVerifiedRefund needs STRIPE_REFUND_LIVE_CLAWBACK + the
 * reverse_transfer/refund_application_fee pair because a Stripe DESTINATION charge splits the
 * payment via an explicit Transfer that has to be explicitly reversed. Square has no
 * Destination-charge equivalent -- every Square payment in this migration lives on the
 * connected MERCHANT's own account (OAuth-scoped, closer to Stripe's *Direct* charge shape --
 * see the architecture doc's "(2) Stripe -> Square Mapping" section), with only the platform's
 * `app_fee_money` cut sitting elsewhere. Square AUTOMATICALLY refunds `app_fee_money`
 * proportionally on every refund by default (confirmed, same doc) -- there is no organizer
 * "clawback" step for FindA.Sale to gate behind a flag here at all. That's why this file has
 * no `squareRefundClawbackEnabled()` equivalent to refundService.ts's `refundClawbackEnabled()`.
 * The ONE flag this migration wave does add (`SQUARE_DISPUTE_LIVE_CLAWBACK`, below) is for a
 * different, narrower, genuinely open question -- see its own comment.
 */

// ---------------------------------------------------------------------------------------
// SQUARE_DISPUTE_LIVE_CLAWBACK -- mirrors STRIPE_DISPUTE_LIVE_CLAWBACK (refundService.ts)
// in SHAPE (an independently-toggleable, default-OFF flag gating a dispute-lost money-path
// consequence) but NOT in mechanism -- see handleSquareDisputeWebhook's own comment on the
// LOST branch for exactly what this does and does not do today. Deliberately a SEPARATE env
// var from the Stripe flag per the dispatch spec -- never reuse STRIPE_DISPUTE_LIVE_CLAWBACK
// for Square events.
// ---------------------------------------------------------------------------------------
export const squareDisputeClawbackEnabled = (): boolean =>
  process.env.SQUARE_DISPUTE_LIVE_CLAWBACK === 'true';

/**
 * Square RefundPayment's own `reason` field is free text (max 192 chars, no confirmed
 * Stripe-Radar-style auto-blocklist mechanism -- unresearched either way this session, not
 * assumed safe). Kept mapped to plain, accurate strings rather than passed through verbatim
 * so this file carries forward the SAME labeling discipline the Stripe side follows
 * (adminController.ts's bulkRefundPurchases comment, 2026-08-30 fix): never default to
 * fraud-sounding language, and never invent a reason the caller didn't actually choose. The
 * principle holds regardless of whether Square auto-blocklists on it -- see dispatch prompt.
 */
function mapReasonToSquareText(reason: 'duplicate' | 'fraudulent' | 'requested_by_customer'): string {
  switch (reason) {
    case 'duplicate':
      return 'Duplicate charge';
    case 'fraudulent':
      return 'Reported as fraudulent';
    case 'requested_by_customer':
    default:
      return 'Requested by customer';
  }
}

/**
 * Resolves the Square OAuth access token that can act on this organizer's payments.
 *
 * RESOLVED (2026-09-07, Wave 0.5) -- see the function body below. The gap description that
 * follows is kept for historical context (why this function exists as its own named seam
 * instead of being inlined) -- do not read it as still-current; the schema fields it refers
 * to as missing now exist.
 *
 * HISTORICAL GAP DESCRIPTION (see RESOLVED note above): Square's RefundPayment
 * requires the Authorization header to be "the account that took the original payment"
 * (developer.squareup.com/docs/payments-api/refund-payments) -- unlike Stripe's platform-
 * secret-key + `Stripe-Account` header pattern, a Square Connect app must call the API using
 * the CONNECTED MERCHANT's own per-merchant OAuth access token, not a single platform-wide
 * token. Wave 0's schema migration (already deployed) added `Organizer.squareMerchantId` /
 * `squareOnboarded` / `squareLocationId` but did NOT add anywhere to store that per-merchant
 * access token -- there is no field in schema.prisma today this function could read. This is
 * NOT something Wave 1 dispatch #4 (this file) is scoped to invent (schema is frozen per this
 * dispatch's own instructions), and guessing a field name that doesn't exist would just fail
 * at runtime with a confusing Prisma error instead of a clear one.
 *
 * This function is the SINGLE integration point for wiring that up once it exists: the
 * Connect-equivalent onboarding dispatch (Wave 1 #2, squareConnectService.ts) is the one that
 * will actually design where a per-merchant Square access token lives. Once it does, only
 * this function's body needs to change -- every caller in this file already awaits it and
 * handles a thrown RefundError the same way it handles every other verification failure.
 * Deliberately throws instead of ever falling back to a platform-level env var: refunding
 * against the WRONG Square account (e.g. a single shared `SQUARE_ACCESS_TOKEN`) would either
 * hard-fail with a Square permission error or, worse, silently succeed against an unrelated
 * merchant's payment history -- an IDOR-shaped failure mode this function refuses to risk.
 */
async function resolveSquareAccessToken(organizerId: string): Promise<string> {
  // Wave 0.5 (2026-09-07): the gap described in this function's own doc comment above is
  // CLOSED -- Organizer now has squareAccessTokenEncrypted/squareRefreshTokenEncrypted/
  // squareTokenExpiresAt columns (migration 20260907020000_square_oauth_token_storage_and_
  // boothcartleg_processor). Delegates to squarePaymentService.ts's
  // resolveOrganizerSquareAccessToken -- the SAME seam checkout (Wave 1 #1) and POS (Wave 1
  // #3) already use -- rather than re-implementing decrypt/refresh/persist logic a second
  // time here. Re-wraps SquareOnboardingIncompleteError as a RefundError so every existing
  // caller of executeVerifiedSquareRefund (which already catches RefundError) keeps working
  // unchanged, matching this file's own "same error class" design principle stated above.
  const organizer = await prisma.organizer.findUnique({
    where: { id: organizerId },
    select: { id: true, squareMerchantId: true, squareOnboarded: true },
  });
  if (!organizer) {
    throw new RefundError('Could not resolve the organizer for this Square refund.', 404, { organizerId });
  }
  try {
    return await resolveOrganizerSquareAccessToken(organizer);
  } catch (err) {
    if (err instanceof SquareOnboardingIncompleteError) {
      throw new RefundError(
        `Square refunds aren't available for this organizer yet (organizerId=${organizerId}) -- ` +
          'Square onboarding is incomplete or the stored OAuth token is missing/expired with no ' +
          'usable refresh token on file.',
        501,
        { organizerId }
      );
    }
    throw err;
  }
}

// SECURITY FIX (findasale-hacker fix-and-reverify pass, 2026-09-08): this defaulted to
// PRODUCTION whenever SQUARE_ENVIRONMENT was anything other than the exact literal 'sandbox'
// (unset, blank, or differently-cased all fell through to Production) -- the opposite, riskier
// default from squareConnectService.ts's getSquareEnvironment() (safely defaults to SANDBOX
// unless SQUARE_ENVIRONMENT is exactly 'production') and from utils/square.ts's
// getSquareClientForMerchant (same fix applied there this pass). Flipped to match the same
// explicit-opt-in-to-production convention across all three files.
function getSquareClientForToken(accessToken: string): SquareClient {
  return new SquareClient({
    token: accessToken,
    environment: process.env.SQUARE_ENVIRONMENT === 'production' ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
  });
}

/**
 * executeVerifiedSquareRefund -- the Square-side choke point every Square refund caller routes
 * through, mirroring refundService.ts's executeVerifiedRefund shape/contract exactly (same
 * parameter order, same return shape, same RefundError class, same TOCTOU claim idiom) so the
 * three call sites (stripeController.ts createRefund, disputeController.ts
 * updateDisputeStatus, adminController.ts bulkRefundPurchases) can add one small
 * `purchase.processor === 'SQUARE'` branch each rather than a parallel code path.
 *
 * Does NOT do auth/ownership/role checks (same contract as the Stripe version -- callers own
 * that). Does NOT send the buyer confirmation email or the in-app "refund issued" notification
 * -- those are also caller-side in the Stripe version (sendRefundConfirmationEmail is called
 * by createRefund/updateDisputeStatus AFTER executeVerifiedRefund returns, not from inside
 * it) and are already fully processor-agnostic, so the existing call sites work unchanged for
 * a Square-routed refund once the "one added branch" lands.
 */
export async function executeVerifiedSquareRefund(
  purchaseId: string,
  refundAmount: number,
  initiatedBy: 'organizer' | 'admin' | 'dispute',
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer'
): Promise<{
  refundedAmount: number;
  purchase: {
    id: string;
    userId: string | null;
    amount: number;
    itemId: string | null;
    user: { id: string; email: string; name: string } | null;
    item: { title: string } | null;
    sale: { organizer: { businessName: string } | null } | null;
  };
}> {
  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: {
      user: { select: { id: true, email: true, name: true } },
      sale: {
        include: {
          organizer: { select: { id: true, userId: true, businessName: true, squareMerchantId: true } },
        },
      },
      // vendorBoothId added (2026-09-07, vendor-booth-cart-checkout dispatch) -- needed to
      // resolve which VendorBooth's own Square account a booth-cart refund runs against (see
      // the isBoothCartPurchase branch below). title was the only field selected before this.
      item: { select: { title: true, vendorBoothId: true } },
    },
  });

  if (!purchase) {
    throw new RefundError('Purchase not found', 404);
  }

  if (purchase.processor !== 'SQUARE') {
    // Defensive -- callers are expected to branch on purchase.processor BEFORE calling this
    // function (see the "one added branch" changes at each call site). A mismatch here means
    // a caller's own branch logic is wrong, not a real refund-eligibility failure -- surfaced
    // as a clear 500 rather than silently attempting a Square API call against a Stripe
    // payment id.
    throw new RefundError('executeVerifiedSquareRefund called for a non-SQUARE purchase', 500, { processor: purchase.processor });
  }

  if (purchase.status !== 'PAID') {
    throw new RefundError('Only paid purchases can be refunded', 400);
  }

  // RESOLVED (2026-09-07, vendor-booth-cart-checkout dispatch) -- the 501 guard that used to
  // live here is GONE. BoothCartLeg now has real Square schema (Wave 0.5:
  // processor/squarePaymentId, migration 20260907020000_...), and this dispatch researched
  // the open Transfer-reversal question directly (see squareVendorBoothCartService.ts's
  // file-header comment, "hub-owner-share live Transfer equivalent" section): Square has NO
  // platform-initiated Transfer-between-connected-merchants primitive at all, so there was
  // NEVER a live Transfer for a Square booth-cart leg's hub-owner share to reverse in the
  // first place -- the question isn't "unresearched," it's answered "not applicable." The
  // PRIMARY refund (reversing the shopper's charge on the booth's own connected Square
  // account) proceeds normally below via the booth's own OAuth token, mirroring
  // refundService.ts's isBoothCartPurchase branch's Stripe-side { stripeAccount } scoping.
  // The hub-owner-share reversal step itself is explicitly SKIPPED with a clear log a few
  // lines below (search "hub-owner-share reversal is a deliberate no-op") -- not silently
  // dropped, not guessed at.
  const isBoothCartPurchase = !!purchase.boothCartTransactionId;

  // Same cash-purchase discriminator convention as refundService.ts's isCashPurchase, applied
  // to squarePaymentId instead of stripePaymentIntentId -- forward-compatible with a future
  // Square-side cash/phone-POS path (Wave 1 #3) that may reuse the same `cash_<uuid>`
  // sentinel convention. No such path exists yet, so this branch is inert today.
  const isCashPurchase = !purchase.squarePaymentId || purchase.squarePaymentId.startsWith('cash_');

  const purchaseAgeMs = Date.now() - purchase.createdAt.getTime();
  const purchaseAgeDays = purchaseAgeMs / (1000 * 60 * 60 * 24);
  if (purchaseAgeDays > 30) {
    throw new RefundError(
      'Refunds can only be issued within 30 days of purchase',
      400,
      { purchaseAgeDays: Math.floor(purchaseAgeDays) }
    );
  }
  // Square's own hard limit is 1 year (developer.squareup.com/docs/payments-api/refund-payments)
  // -- FindA.Sale's 30-day policy above is always the binding constraint, so no separate check
  // is needed for Square's limit; noted here so a future policy change doesn't silently exceed it.

  if (!(refundAmount > 0) || refundAmount > purchase.amount) {
    throw new RefundError(
      'Refund amount must be greater than zero and cannot exceed the original purchase amount',
      400,
      { requestedAmount: refundAmount, purchaseAmount: purchase.amount }
    );
  }

  // TOCTOU claim -- identical idiom to refundService.ts's PAID->REFUNDING compare-and-swap.
  const claim = await prisma.purchase.updateMany({
    where: { id: purchaseId, status: 'PAID' },
    data: { status: 'REFUNDING' },
  });
  if (claim.count !== 1) {
    throw new RefundError('Refund already in progress or not refundable', 400);
  }

  const organizerId = purchase.sale?.organizer?.id;

  if (!isCashPurchase) {
    if (!purchase.squarePaymentId) {
      await prisma.purchase.updateMany({ where: { id: purchaseId, status: 'REFUNDING' }, data: { status: 'PAID' } });
      throw new RefundError('This Square purchase has no squarePaymentId on file. Cannot resolve which payment to refund.', 400);
    }
    // Vendor-booth-cart purchases refund against the BOOTH's OWN connected Square account
    // (the booth is the merchant of record for its own leg, exactly as it already is on the
    // Stripe side -- see refundService.ts's isBoothCartPurchase branch for the precedent this
    // mirrors). Every other Square purchase refunds against the ORGANIZER's own account,
    // unchanged from before this dispatch.
    let accessToken: string;
    if (isBoothCartPurchase) {
      const vendorBoothId = purchase.item?.vendorBoothId;
      if (!vendorBoothId) {
        await prisma.purchase.updateMany({ where: { id: purchaseId, status: 'REFUNDING' }, data: { status: 'PAID' } });
        throw new RefundError("Could not resolve this booth-cart purchase's vendor booth. Cannot resolve which Square account to refund against.", 400);
      }
      const booth = await prisma.vendorBooth.findUnique({
        where: { id: vendorBoothId },
        select: { id: true, userId: true, squareAccountId: true, squareOnboarded: true },
      });
      if (!booth) {
        await prisma.purchase.updateMany({ where: { id: purchaseId, status: 'REFUNDING' }, data: { status: 'PAID' } });
        throw new RefundError('The vendor booth for this purchase could not be found.', 404);
      }
      try {
        accessToken = await resolveVendorBoothSquareAccessToken(booth);
      } catch (err) {
        await prisma.purchase.updateMany({ where: { id: purchaseId, status: 'REFUNDING' }, data: { status: 'PAID' } });
        if (err instanceof SquareBoothOnboardingIncompleteError) {
          throw new RefundError(
            `Square refunds aren't available for this booth yet (vendorBoothId=${vendorBoothId}) -- ` +
              'Square onboarding is incomplete or the stored OAuth token is missing/expired with no ' +
              'usable refresh token on file.',
            501,
            { vendorBoothId }
          );
        }
        throw err;
      }
    } else {
      if (!organizerId) {
        await prisma.purchase.updateMany({ where: { id: purchaseId, status: 'REFUNDING' }, data: { status: 'PAID' } });
        throw new RefundError('Could not resolve the organizer for this Square purchase. Cannot resolve which Square account to refund against.', 400);
      }
      accessToken = await resolveSquareAccessToken(organizerId);
    }

    try {
      const client = getSquareClientForToken(accessToken);
      const refundReasonText = reason ? mapReasonToSquareText(reason) : undefined;

      // CONFIRMED 2026-09-07 (CI type error, this session): fetched refunds/client/Client.ts
      // directly from the Square Node SDK source (github.com/square/square-nodejs-sdk) -- the
      // real method is `refundPayment`, not `create`. Same request shape already used below.
      await client.refunds.refundPayment({
        idempotencyKey: `square-refund-${purchase.id}`,
        paymentId: purchase.squarePaymentId,
        amountMoney: {
          amount: BigInt(Math.round(refundAmount * 100)),
          currency: 'USD',
        },
        ...(refundReasonText ? { reason: refundReasonText } : {}),
        // No app_fee_money set deliberately -- omitting it is what makes Square refund the
        // application fee PROPORTIONALLY by default (see file header comment). Only ever set
        // this if a future caller needs to override that default, which no caller does today.
      });

      // Hub-owner-share reversal is a DELIBERATE NO-OP for a Square booth-cart refund -- see
      // this function's own comment above (RESOLVED 2026-09-07): Square has no
      // Transfer-between-merchants primitive, so no live Transfer was ever made for a Square
      // leg's hub-owner share (transferHubOwnerShareForLeg no-ops for SQUARE legs in
      // vendorBoothCartController.ts). There is therefore nothing here to reverse, unlike
      // refundService.ts's Stripe-side settleHubOwnerReversalForLeg call. The hub owner's
      // originally-computed share (BoothCartLeg.hubOwnerShareAmount) remains whatever it was
      // before this refund -- a future settlement-sweep mechanism (not built this dispatch,
      // see squareVendorBoothCartService.ts's file header) is the intended place to reconcile
      // a refunded Square leg's accrued-but-unsettled hub-owner share, not this function.
      if (isBoothCartPurchase) {
        console.log(
          `[squareRefundService] Square booth-cart refund for purchase ${purchase.id}: hub-owner-share ` +
            'reversal is a deliberate no-op (Square has no Transfer to reverse -- see file comment).'
        );
      }
    } catch (squareErr) {
      await prisma.purchase.updateMany({
        where: { id: purchaseId, status: 'REFUNDING' },
        data: { status: 'PAID' },
      });
      throw squareErr;
    }
  }

  // Finalize -- identical shape to executeVerifiedRefund's own finalize block.
  await prisma.purchase.update({
    where: { id: purchaseId },
    data: {
      status: 'REFUNDED',
      refundedAmount: refundAmount,
      refundedAt: new Date(),
      refundInitiatedBy: initiatedBy,
    },
  });

  if (purchase.itemId) {
    try {
      await prisma.itemReservation.updateMany({
        where: { itemId: purchase.itemId, status: { notIn: ['CANCELLED', 'EXPIRED', 'COMPLETED'] } },
        data: { status: 'CANCELLED' },
      });
    } catch (err) {
      console.error(`[executeVerifiedSquareRefund] Failed to reset ItemReservation for item ${purchase.itemId} after refund of purchase ${purchaseId} (non-fatal):`, err);
    }
  }

  if (purchase.itemId) {
    try {
      await prisma.item.updateMany({
        where: { id: purchase.itemId, stockSold: { gt: 0 } },
        data: { stockSold: { decrement: 1 } },
      });
    } catch (err) {
      console.error(`[executeVerifiedSquareRefund] Failed to decrement stockSold for item ${purchase.itemId} after refund of purchase ${purchaseId} (non-fatal):`, err);
    }
  }

  // Cash-fee-balance reversal -- same as refundService.ts's cash-purchase branch. Inert today
  // (no Square cash path exists), forward-compatible with Wave 1 #3 (phone-based POS).
  if (isCashPurchase && purchase.platformFeeAmount && purchase.platformFeeAmount > 0 && organizerId) {
    try {
      const reversed = purchase.platformFeeAmount;
      const decremented = await prisma.organizer.updateMany({
        where: { id: organizerId, cashFeeBalance: { gte: reversed } },
        data: { cashFeeBalance: { decrement: reversed }, cashFeeBalanceUpdatedAt: new Date() },
      });
      if (decremented.count === 0) {
        await prisma.organizer.updateMany({
          where: { id: organizerId },
          data: { cashFeeBalance: 0, cashFeeBalanceUpdatedAt: new Date() },
        });
      }
    } catch (err) {
      console.error(`[executeVerifiedSquareRefund] Failed to reverse cashFeeBalance for organizer ${organizerId} after refund of purchase ${purchaseId} (non-fatal):`, err);
    }
  }

  // Cash-fee-DEBT-COLLECTION reversal (2026-09-12, Stripe removal) -- distinct from the
  // cash-purchase branch above. This purchase was a CARD sale whose appFeeMoney was padded to
  // recoup outstanding cashFeeBalance (see cashFeeService.applyCashDebtToAppFee /
  // squarePaymentController.ts). Square automatically refunds app_fee_money proportionally on
  // every refund (see this file's header comment) -- meaning a refund of this purchase already
  // claws the padded amount back OUT of the platform's own Square balance. If we don't also
  // re-accrue it here, the organizer's debt would be marked "collected" in our DB while the
  // platform no longer actually holds that money -- silently forgiving debt on every refunded
  // sale. Re-accrue the FULL recorded amount regardless of partial/full refund, matching the
  // simple (non-proportional) posture of the cash-purchase branch above.
  if (purchase.cashDebtCollectedAmount && purchase.cashDebtCollectedAmount > 0 && organizerId) {
    try {
      await prisma.organizer.update({
        where: { id: organizerId },
        data: {
          cashFeeBalance: { increment: purchase.cashDebtCollectedAmount },
          cashFeeBalanceUpdatedAt: new Date(),
        },
      });
    } catch (err) {
      console.error(`[executeVerifiedSquareRefund] Failed to re-accrue cashDebtCollectedAmount for organizer ${organizerId} after refund of purchase ${purchaseId} (non-fatal):`, err);
    }
  }

  // No-op for every Square purchase today (isBoothCartPurchase is guarded out above) -- kept
  // for structural parity with executeVerifiedRefund and forward-compatibility once/if a
  // Square-side vendor-booth path ever ships.
  notifyVendorBoothSaleRefunded(purchaseId).catch((err) =>
    console.error(`[executeVerifiedSquareRefund] Vendor refund notification failed for purchase ${purchaseId} (non-fatal):`, err)
  );

  return {
    refundedAmount: refundAmount,
    purchase: {
      id: purchase.id,
      userId: purchase.userId,
      amount: purchase.amount,
      itemId: purchase.itemId,
      user: purchase.user ? { id: purchase.user.id, email: purchase.user.email, name: purchase.user.name } : null,
      item: purchase.item ? { title: purchase.item.title } : null,
      sale: purchase.sale ? { organizer: purchase.sale.organizer ? { businessName: purchase.sale.organizer.businessName } : null } : null,
    },
  };
}

// =========================================================================================
// Square dispute (card-network chargeback) handling -- handleSquareDisputeWebhook
// =========================================================================================

/**
 * Minimal local type for the Square dispute webhook payload shape. NOT imported from the
 * `square` package's own generated types -- this file was written without a working local
 * TypeScript check (see handoff item 7), and guessing at an exact exported type name
 * (`Square.Dispute` vs `Square.WebhookEvent` vs something else) risked a wrong import that
 * fails to compile instead of a loosely-typed object that is at worst under-strict. The field
 * names below ARE confirmed against Square's real webhook payload example
 * (developer.squareup.com/docs/disputes-api/process-disputes, "Webhook notifications"
 * section, fetched live 2026-09-07) -- not guessed.
 */
export interface SquareDisputeWebhookEvent {
  merchant_id: string;
  type: 'dispute.created' | 'dispute.state.updated' | string;
  event_id: string;
  created_at: string;
  data: {
    type: 'dispute';
    id: string;
    object: {
      dispute: {
        id: string;
        amount_money?: { amount: number; currency: string };
        reason?: string;
        // Confirmed states from Square's own docs (process-disputes page, "Dispute outcomes"
        // + webhook table): EVIDENCE_REQUIRED, PROCESSING, WON, LOST, ACCEPTED. Left as a
        // plain string union with a string fallback rather than a closed enum -- Square's own
        // reference lists these as the documented set but does not formally close the type.
        state: 'EVIDENCE_REQUIRED' | 'PROCESSING' | 'WON' | 'LOST' | 'ACCEPTED' | string;
        disputed_payment?: { payment_id?: string };
        due_at?: string;
        card_brand?: string;
        location_id?: string;
      };
    };
  };
}

/**
 * handleSquareDisputeWebhook -- Square-side mirror of stripeController.ts's
 * charge.dispute.created + charge.dispute.closed(lost) handling, built as a standalone
 * function (not wired into any route here) for the Webhooks dispatch (Wave 1 #5,
 * routes/square.ts + squareWebhookController.ts) to call from its own event switch, the same
 * way it will call other per-event-type handlers. This function does NOT do webhook signature
 * verification, NOT do ProcessedWebhookEvent idempotency dedup, and NOT parse the raw request
 * body -- all three are the Webhooks dispatch's own scope (WebhooksHelper.verifySignature +
 * the `square:${event_id}` ProcessedWebhookEvent namespace, per the architecture doc). This
 * function receives the already-verified, already-deduped, already-parsed event object.
 *
 * CONFIRMED exact Square dispute event names (live web fetch, 2026-09-07,
 * developer.squareup.com/docs/disputes-api/process-disputes "Webhook notifications" section
 * AND developer.squareup.com/reference/square/disputes-api/webhooks): `dispute.created` and
 * `dispute.state.updated`. The scoping doc's guess ("dispute.created -> dispute.state.updated")
 * was correct -- there is no third/different event name; `dispute.evidence.created` and
 * `dispute.evidence.deleted` also exist but are out of scope here (evidence submission is not
 * part of this dispatch).
 *
 * KEPT SEPARATE FROM FindA.Sale's OWN in-house `Dispute` model (disputeController.ts) -- same
 * boundary the Stripe side already maintains (see disputeController.ts's own file comment: the
 * in-house Dispute model is a buyer-filed support ticket keyed on a free-text `orderId`, with
 * zero Prisma relation to Purchase; a real card-network dispute here is tracked entirely via
 * `Purchase.status` ('DISPUTED' / 'DISPUTE_LOST'), mirroring exactly how stripeController.ts's
 * charge.dispute.* handlers never touch the in-house Dispute table either). This function
 * never reads or writes `prisma.dispute` for that reason.
 */
export async function handleSquareDisputeWebhook(event: SquareDisputeWebhookEvent): Promise<void> {
  const dispute = event.data?.object?.dispute;
  if (!dispute) {
    console.error('[squareRefundService] handleSquareDisputeWebhook received an event with no dispute object', { eventType: event.type, eventId: event.event_id });
    return;
  }

  const paymentId = dispute.disputed_payment?.payment_id;
  if (!paymentId) {
    console.warn(`[squareRefundService] Square dispute ${dispute.id} has no disputed_payment.payment_id -- cannot resolve a Purchase, skipping.`);
    return;
  }

  const purchase = await prisma.purchase.findFirst({
    where: { squarePaymentId: paymentId },
    include: {
      item: { include: { sale: { include: { organizer: { select: { userId: true, id: true } } } } } },
      sale: { include: { organizer: { select: { userId: true, id: true } } } },
      user: true,
    },
  });

  const disputeSale = purchase?.sale ?? purchase?.item?.sale;
  if (!purchase || !disputeSale) {
    console.warn(`[squareRefundService] Could not resolve a Purchase for Square dispute ${dispute.id} (payment ${paymentId}) -- event type ${event.type}.`);
    Sentry.captureMessage('Square dispute: could not resolve Purchase for a dispute event', {
      tags: { area: 'square-dispute' },
      extra: { disputeId: dispute.id, paymentId, eventType: event.type },
    });
    return;
  }

  if (event.type === 'dispute.created') {
    try {
      await prisma.purchase.update({ where: { id: purchase.id }, data: { status: 'DISPUTED' } });
      console.log(`[squareRefundService] Purchase marked DISPUTED: purchase_id=${purchase.id}, dispute_id=${dispute.id}`);

      if (purchase.user) {
        await prisma.user.update({ where: { id: purchase.user.id }, data: { chargebackCount: { increment: 1 } } });
        const updatedUser = await prisma.user.findUnique({ where: { id: purchase.user.id }, select: { chargebackCount: true, suspendedAt: true } });
        if (updatedUser && updatedUser.chargebackCount >= 3 && !updatedUser.suspendedAt) {
          await prisma.user.update({ where: { id: purchase.user.id }, data: { suspendedAt: new Date(), suspendReason: 'SERIAL_CHARGEBACKS' } });
          console.warn(`[squareRefundService] Buyer suspended after chargeback #${updatedUser.chargebackCount}: user=${purchase.user.id}`);
        }

        const { clawBackChargebackXp } = await import('./xpService');
        const clawedBackXp = await clawBackChargebackXp(purchase.id, purchase.user.id);
        console.log(`[squareRefundService] Clawed back ${clawedBackXp} XP from user ${purchase.user.id} for chargeback`);
      }

      const { recordChargebackIncident } = await import('./fraudService');
      await recordChargebackIncident(disputeSale!.organizerId, purchase.id, dispute.id);

      const monthYear = new Date().toISOString().slice(0, 7);
      const metrics = await prisma.platformMetrics.upsert({
        where: { monthYear },
        create: { monthYear, chargebackCount: 1, transactionCount: 1 },
        update: { chargebackCount: { increment: 1 } },
      });
      if (metrics.transactionCount > 0 && metrics.chargebackCount / metrics.transactionCount > 0.008) {
        console.error(`[squareRefundService] ALERT: Chargeback rate exceeded 0.8% for ${monthYear}:`, metrics);
      }

      const disputeOrganizerUserId = disputeSale!.organizer?.userId;
      if (disputeOrganizerUserId) {
        createNotification({
          userId: disputeOrganizerUserId,
          type: 'chargeback_opened',
          title: 'Chargeback filed against a sale',
          body: `A buyer's bank has filed a chargeback for "${purchase.item?.title || 'an item'}". This may affect your Square balance -- check your Square Dashboard for details and any response deadline.`,
          link: `/organizer/sales/${disputeSale!.id}`,
          channel: 'OPERATIONAL',
          sendEmail: true,
        }).catch((err) => console.error(`[squareRefundService] Failed to create chargeback_opened notification for purchase ${purchase.id}:`, err));
      } else {
        console.error(`[squareRefundService] Skipped chargeback_opened notification for purchase ${purchase.id} -- organizer.userId did not resolve`);
      }
    } catch (err) {
      console.error(`[squareRefundService] Failed to process dispute.created ${dispute.id}:`, err);
      Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
        tags: { area: 'square-dispute' },
        extra: { disputeId: dispute.id, paymentId },
      });
    }
    return;
  }

  if (event.type === 'dispute.state.updated' && dispute.state === 'LOST') {
    try {
      // TOCTOU claim -- same compare-and-swap idiom as executeVerifiedSquareRefund /
      // refundService.ts, guarding against a duplicate/redelivered event applying this twice.
      const claim = await prisma.purchase.updateMany({
        where: { id: purchase.id, status: 'DISPUTED' },
        data: { status: 'DISPUTE_LOST' },
      });
      if (claim.count !== 1) {
        const current = await prisma.purchase.findUnique({ where: { id: purchase.id }, select: { status: true } });
        if (current?.status === 'DISPUTE_LOST') {
          console.log(`[squareRefundService] Purchase ${purchase.id} already DISPUTE_LOST -- skipping duplicate dispute.state.updated(LOST).`);
        } else {
          console.error(`[squareRefundService] dispute.state.updated(LOST) for purchase ${purchase.id} but it was NOT in DISPUTED state (actual: ${current?.status ?? 'not found'}) -- needs manual review.`);
          Sentry.captureMessage('Square dispute LOST but purchase was not in DISPUTED state', {
            tags: { area: 'square-dispute' },
            extra: { disputeId: dispute.id, purchaseId: purchase.id, actualStatus: current?.status ?? null },
          });
        }
        return;
      }

      // NO PLATFORM-SIDE REVERSAL OF THE DISPUTED PRINCIPAL -- by direct analogy to
      // stripeController.ts's own charge.dispute.closed(lost) handling of a Stripe DIRECT
      // charge ("no platform-side reversal needed, liability already on connected account"):
      // every Square payment in this migration lives on the connected merchant's OWN account
      // (see file header comment), so a lost dispute's disputed amount is pulled by
      // Square/the card network directly from THAT account's own balance -- FindA.Sale never
      // held those funds and has nothing to reverse. This is true regardless of the
      // SQUARE_DISPUTE_LIVE_CLAWBACK flag below.
      console.log(`[squareRefundService] Square dispute LOST for purchase ${purchase.id} (dispute ${dispute.id}) -- no platform-side principal reversal needed, liability already on the organizer's own Square account.`);

      if (squareDisputeClawbackEnabled()) {
        // GENUINELY UNRESEARCHED, NOT INVENTED (see handoff item 5): Square's own docs confirm
        // `app_fee_money` is refunded proportionally and automatically on a REFUND
        // (developer.squareup.com/docs/payments-api/collect-fees/payment-with-app-fee-refund)
        // but say nothing about what happens to an already-paid `app_fee_money` cut when the
        // underlying payment is LOST to a dispute instead of refunded -- that could mean
        // FindA.Sale keeps a small windfall on every lost Square dispute with no automatic
        // reconciliation. Rather than guess at an unconfirmed Square API call to claw back the
        // platform's own app_fee_money share, this flag (when on) raises a clear, actionable
        // signal for manual/product review instead of attempting unverified money movement.
        console.error(`[squareRefundService] SQUARE_DISPUTE_LIVE_CLAWBACK is on but the app_fee_money clawback mechanism for a lost Square dispute is UNRESEARCHED -- no automated action taken for purchase ${purchase.id} (dispute ${dispute.id}). Needs manual review: does FindA.Sale's platform fee for this sale need to be manually returned?`);
        Sentry.captureMessage('Square dispute LOST -- app_fee_money clawback mechanism unresearched, manual review needed', {
          tags: { area: 'square-dispute-clawback' },
          extra: { disputeId: dispute.id, purchaseId: purchase.id, amountMoney: dispute.amount_money },
        });
      } else {
        console.log(`[squareRefundService] SQUARE_DISPUTE_LIVE_CLAWBACK is off -- no clawback review flagged for dispute ${dispute.id} (purchase ${purchase.id}).`);
      }
    } catch (err) {
      console.error(`[squareRefundService] Failed to process dispute.state.updated(LOST) ${dispute.id}:`, err);
      Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
        tags: { area: 'square-dispute' },
        extra: { disputeId: dispute.id, paymentId },
      });
    }
  }
}
