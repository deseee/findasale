import cron from 'node-cron';
import * as Sentry from '@sentry/node';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import { getStripe } from '../utils/stripe';
import {
  attemptDeadInvoiceRefund,
  deadInvoiceAutoRefundEnabled,
  type DeadInvoiceRefundOutcome,
} from '../services/deadInvoiceRefundService';

/**
 * deadInvoicePaidSweepJob.ts -- PART 1: after-the-fact detector for money captured
 * against a DEAD HoldInvoice (2026-08-17).
 *
 * THE GAP THIS CLOSES
 * -------------------
 * Nothing in the codebase ever revisited a dead invoice:
 *   - invoiceExpiryJob.ts's candidate query is `status: 'PENDING'`
 *     (invoiceExpiryJob.ts:162) -- a CANCELLED or EXPIRED invoice is never a
 *     candidate for anything, ever again.
 *   - markHoldInvoicePaid (holdInvoicePaymentRecorder.ts) has exactly two callers:
 *     that job's STRANDED-PAID branch (invoiceExpiryJob.ts:211) and the
 *     `charge.succeeded` webhook. Both are reactive.
 *   - The Stripe `expires_at` handed to Checkout is CLAMPED UP to Stripe's
 *     30-minute floor (utils/stripeCheckoutExpiry.ts, cited in
 *     invoiceExpiryJob.ts:349-352), so a Checkout Session routinely OUTLIVES the
 *     HoldInvoice it belongs to by up to ~31 minutes. releaseInvoice
 *     (organizer-triggered CANCELLED) has no timer relationship to the session at
 *     all and can leave a payable link behind for its full lifetime.
 *
 * So when a shopper pays a session whose invoice has already gone CANCELLED or
 * EXPIRED: as of the P0 fix in holdInvoicePaymentRecorder.ts (2026-08-17)
 * markHoldInvoicePaid now REFUSES to record the sale and raises a
 * DEAD-INVOICE-PAYMENT Sentry alert -- but that fix only fires if a webhook
 * arrives. If the `charge.succeeded` webhook never fires (the confirmed
 * metadata gap documented in invoiceExpiryJob.ts:61-69, a dropped delivery, or
 * an invoice whose PaymentIntent metadata backfill failed), NOTHING notices.
 * Money is captured, no Purchase row exists, and refundService's
 * executeVerifiedRefund keys off `purchaseId` (refundService.ts:170,188) so
 * there is nothing to refund against. The only trace is a Railway log line.
 *
 * This job is the proactive sweep that closes that hole: it goes looking for
 * dead invoices whose Stripe Checkout Session may still have been paid, asks
 * Stripe directly, and alerts on every hit.
 *
 * ACCOUNT SCOPING (the thing that makes this actually work)
 * --------------------------------------------------------
 * markSoldAndCreateInvoice / createCombinedInvoice create the Checkout Session
 * on the CONNECTED account when the Direct-charges allowlist routes the
 * organizer there (services/stripeConnectService.ts shouldUseDirectCharge --
 * gated on STRIPE_DIRECT_CHARGES_ORGANIZER_ALLOWLIST, which is NON-EMPTY in
 * production). A platform-scoped `checkout.sessions.retrieve` for such a session
 * returns "No such checkout session" -- Stripe is telling the truth, the object
 * does not exist on the platform account (utils/expireCheckoutSession.ts:19-27).
 * UPDATED 2026-08-18: HoldInvoice.stripeAccountId/chargeType now exist (the schema
 * gap this comment used to flag is closed). resolveDeadInvoiceStripeContext's first
 * retrieve attempt below is passed the invoice's own pinned stripeAccountId when
 * present -- it cannot drift, unlike `sale.organizer.stripeConnectId`, which is
 * still the fallback for a pre-migration (NULL) row and used exactly the way
 * expireCheckoutSessionSafely does (utils/expireCheckoutSession.ts:69-85): try the
 * platform/pinned account first, and on a resource_missing retry against the sale
 * organizer's CURRENT stripeConnectId -- the same field invoiceExpiryJob.ts loads
 * and uses.
 *
 * Getting this wrong would make the sweep silently miss exactly the direct-charge
 * cases it exists to catch, which is why the retry is not optional and why the
 * account that answered is carried forward into every subsequent Stripe call
 * (PaymentIntent retrieve, refund list, refund create).
 *
 * KNOWN ADJACENT BUG, NOT FIXED HERE: invoiceExpiryJob.ts:197's
 * `stripe().checkout.sessions.retrieve(invoice.stripeSessionId)` is NOT
 * account-scoped and has no connected-account fallback, so its STRANDED-PAID
 * branch cannot see a direct-charge session at all -- it throws resource_missing
 * into the per-row catch at :366 and retries forever. Flagged in the handoff
 * rather than edited: that file is concurrently owned this session.
 *
 * WHAT IT DOES ON A HIT
 * ---------------------
 * Always: a `Sentry.captureException` carrying invoice id, session id, payment
 * intent id, amount, invoice status and sale id (same shape as
 * holdInvoicePaymentRecorder.ts's reportDeadInvoicePayment, :103-155).
 * Optionally, and OFF BY DEFAULT: a full automatic refund -- see
 * services/deadInvoiceRefundService.ts. With the refund flag unset this job is
 * pure detect-and-alert and touches no money and no DB row.
 *
 * Kill-switch: DEAD_INVOICE_SWEEP_DISABLED=1 makes the job early-return
 * (rollback lever, matching invoiceExpiryJob.ts:153 /
 * purchaseExpiryJob.ts's PURCHASE_EXPIRY_RECLAIM_DISABLED).
 */

const stripe = () => getStripe();

/** How far back to look. A dead invoice older than this is out of scope for the sweep. */
const LOOKBACK_DAYS = parseFloat(process.env.DEAD_INVOICE_SWEEP_LOOKBACK_DAYS ?? '30');

/**
 * Re-alert cooldown. Without it, an un-refundable paid-dead invoice (the default
 * alert-only mode) would raise a fresh Sentry event every single run, forever.
 *
 * HONEST LIMITATION: this map is PROCESS-LOCAL and resets on every Railway deploy or
 * restart. Sentry's own fingerprint grouping folds repeats into one issue, so the
 * failure mode is event-count noise on a single issue, never a missed alert. The
 * durable fix was a persisted column -- shipped 2026-08-18 (HoldInvoice.stripeAccountId /
 * chargeType). This in-memory cooldown map stays regardless: it also governs Sentry
 * re-alert frequency, which the new column does not change.
 */
const REALERT_HOURS = parseFloat(process.env.DEAD_INVOICE_SWEEP_REALERT_HOURS ?? '24');
const lastAlertedAt = new Map<string, number>();

/**
 * Hard bound on Stripe calls per run (1-2 per candidate). Freshest-first ordering means the
 * newest exposure is always checked; a sustained overflow is itself logged loudly.
 */
const MAX_PER_RUN = parseInt(process.env.DEAD_INVOICE_SWEEP_MAX_PER_RUN ?? '200', 10);

const isResourceMissing = (err: any): boolean =>
  err?.code === 'resource_missing' ||
  err?.raw?.code === 'resource_missing' ||
  /no such checkout session/i.test(String(err?.message ?? ''));

export interface DeadInvoiceStripeContext {
  session: any;
  /** The connected account the session was found on, or null if it lives on the platform. */
  stripeAccount: string | null;
  paymentIntent: any | null;
  /**
   * Evidence-derived, never inferred from config: true when the Session was only
   * retrievable on the connected account (Direct charge), or when a platform-retrieved
   * PaymentIntent carries no `transfer_data.destination` while the organizer has a
   * connected account. See resolveDeadInvoiceStripeContext.
   */
  isDirectCharge: boolean;
}

/**
 * Retrieve a dead invoice's Checkout Session (and its PaymentIntent) with correct
 * account scoping. Mirrors utils/expireCheckoutSession.ts:69-85's retrieveSession
 * fallback exactly -- platform first, connected account on resource_missing.
 *
 * Exported so a future caller (or a fix to invoiceExpiryJob's unscoped retrieve at
 * :197) can reuse it rather than re-deriving the fallback a third time.
 */
export async function resolveDeadInvoiceStripeContext(
  sessionId: string,
  organizerStripeConnectId: string | null | undefined
): Promise<DeadInvoiceStripeContext | null> {
  const s = stripe();

  let session: any;
  let stripeAccount: string | null = null;

  try {
    session = await s.checkout.sessions.retrieve(sessionId);
  } catch (err: any) {
    if (!isResourceMissing(err) || !organizerStripeConnectId) throw err;
    // Direct-charge path: the Session lives on the connected account.
    session = await s.checkout.sessions.retrieve(sessionId, undefined, {
      stripeAccount: organizerStripeConnectId,
    });
    stripeAccount = organizerStripeConnectId;
  }

  if (!session) return null;

  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent as any)?.id ?? null;

  let paymentIntent: any = null;
  if (paymentIntentId) {
    // Scoped to whichever account answered for the Session -- a Direct charge's
    // PaymentIntent does not exist on the platform account either.
    paymentIntent = await s.paymentIntents.retrieve(
      paymentIntentId,
      undefined,
      stripeAccount ? { stripeAccount } : undefined
    );
  }

  // A destination charge lives on the platform and carries transfer_data.destination
  // (refundService.ts:276-278 documents the same distinction). If the session was only
  // findable on the connected account, it is unambiguously a Direct charge.
  const isDirectCharge =
    stripeAccount !== null ||
    (!!organizerStripeConnectId && !!paymentIntent && !paymentIntent.transfer_data?.destination);

  return { session, stripeAccount, paymentIntent, isDirectCharge };
}

function shouldAlert(invoiceId: string): boolean {
  const last = lastAlertedAt.get(invoiceId);
  const cooldownMs = REALERT_HOURS * 60 * 60 * 1000;
  if (last && Date.now() - last < cooldownMs) return false;
  lastAlertedAt.set(invoiceId, Date.now());
  return true;
}

function reportPaidDeadInvoice(params: {
  invoiceId: string;
  invoiceStatus: string;
  sessionId: string;
  paymentIntentId: string | null;
  amountCents: number;
  saleId: string;
  shopperUserId: string;
  stripeAccount: string | null;
  isDirectCharge: boolean;
  refundOutcome: DeadInvoiceRefundOutcome;
}): void {
  const amountDollars = (params.amountCents / 100).toFixed(2);
  const msg =
    `[deadInvoicePaidSweep] PAID-DEAD-INVOICE invoice=${params.invoiceId} ` +
    `status=${params.invoiceStatus} session=${params.sessionId} ` +
    `pi=${params.paymentIntentId ?? '(none)'} amount=$${amountDollars} sale=${params.saleId} ` +
    `account=${params.stripeAccount ?? 'platform'} charge=${params.isDirectCharge ? 'DIRECT' : 'DESTINATION'} ` +
    `-- Stripe shows this Checkout Session PAID but the HoldInvoice was already dead. ` +
    `No sale was recorded and NO Purchase row exists for this charge. ` +
    `Auto-refund: ${params.refundOutcome.refunded ? `ISSUED (${params.refundOutcome.refundId})` : `NOT ISSUED -- ${params.refundOutcome.reason}`}.`;

  console.error(msg);

  if (!shouldAlert(params.invoiceId)) return;

  try {
    Sentry.captureException(new Error(msg), {
      tags: {
        area: 'dead-invoice-paid-sweep',
        invoiceStatus: params.invoiceStatus,
        chargeType: params.isDirectCharge ? 'DIRECT' : 'DESTINATION',
        autoRefunded: String(params.refundOutcome.refunded),
      },
      extra: {
        invoiceId: params.invoiceId,
        invoiceStatus: params.invoiceStatus,
        stripeSessionId: params.sessionId,
        stripePaymentIntentId: params.paymentIntentId,
        amountCents: params.amountCents,
        amountDollars,
        saleId: params.saleId,
        shopperUserId: params.shopperUserId,
        stripeAccount: params.stripeAccount,
        isDirectCharge: params.isDirectCharge,
        refundAttempted: params.refundOutcome.attempted,
        refundIssued: params.refundOutcome.refunded,
        refundReason: params.refundOutcome.reason,
        refundId: params.refundOutcome.refundId ?? null,
      },
    });
  } catch {
    // Sentry may not be initialized -- the console.error above is the fallback record.
  }
}

export const sweepDeadInvoicesForPayment = async (): Promise<void> => {
  if (process.env.DEAD_INVOICE_SWEEP_DISABLED === '1') {
    console.log('[deadInvoicePaidSweep] Disabled via DEAD_INVOICE_SWEEP_DISABLED=1 -- skipping run.');
    return;
  }

  try {
    const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    // `updatedAt` (not createdAt) is the right window anchor: the moment the invoice
    // went CANCELLED/EXPIRED is when the exposure starts. An old invoice cancelled
    // yesterday is in scope; a young invoice is trivially in scope either way.
    // REFUNDED is deliberately excluded -- it is the durable marker the refund path
    // writes (see deadInvoiceRefundService.ts), so a refunded invoice is never re-swept.
    const candidates = await prisma.holdInvoice.findMany({
      where: {
        status: { in: ['CANCELLED', 'EXPIRED'] },
        stripeSessionId: { not: null },
        updatedAt: { gte: cutoff },
      },
      select: {
        id: true,
        status: true,
        stripeSessionId: true,
        itemIds: true,
        saleId: true,
        shopperUserId: true,
        totalAmount: true,
        updatedAt: true,
        // Stripe account + charge-shape snapshot (2026-08-18 migration): the invoice's own
        // pinned account, preferred below. `sale.organizer.stripeConnectId` remains the
        // fallback for pre-migration (NULL) rows -- same join invoiceExpiryJob.ts uses, for
        // the same reason: a Direct-charge session is not retrievable with a platform-scoped
        // call.
        stripeAccountId: true,
        sale: { select: { organizer: { select: { stripeConnectId: true } } } },
      },
      orderBy: { updatedAt: 'desc' },
      take: MAX_PER_RUN,
    });

    if (candidates.length === 0) return;

    if (candidates.length === MAX_PER_RUN) {
      console.warn(
        `[deadInvoicePaidSweep] Hit the per-run cap of ${MAX_PER_RUN} candidates -- older dead invoices in the ${LOOKBACK_DAYS}d window are NOT being checked this run. Raise DEAD_INVOICE_SWEEP_MAX_PER_RUN or narrow DEAD_INVOICE_SWEEP_LOOKBACK_DAYS.`
      );
    }

    console.log(
      `[deadInvoicePaidSweep] Checking ${candidates.length} dead HoldInvoice row(s) (CANCELLED/EXPIRED with a Stripe session, last ${LOOKBACK_DAYS}d). Auto-refund ${deadInvoiceAutoRefundEnabled() ? 'ENABLED' : 'DISABLED (alert-only)'}.`
    );

    let paidDead = 0;
    let refunded = 0;
    let notFound = 0;
    let errors = 0;

    for (const invoice of candidates) {
      // Per-row failure must never abort the batch (invoiceExpiryJob.ts:366 pattern).
      try {
        const ctx = await resolveDeadInvoiceStripeContext(
          invoice.stripeSessionId!,
          invoice.stripeAccountId ?? invoice.sale?.organizer?.stripeConnectId
        );

        if (!ctx) {
          notFound++;
          continue;
        }

        if (ctx.session.payment_status !== 'paid') {
          // The overwhelmingly common case: dead invoice, unpaid session. Nothing to do.
          continue;
        }

        paidDead++;

        const paymentIntentId =
          typeof ctx.session.payment_intent === 'string'
            ? ctx.session.payment_intent
            : (ctx.session.payment_intent as any)?.id ?? null;

        const amountCents =
          typeof ctx.session.amount_total === 'number'
            ? ctx.session.amount_total
            : invoice.totalAmount;

        // PART 2 -- flag-gated, DEFAULT OFF. With DEAD_INVOICE_AUTO_REFUND_ENABLED unset
        // this returns { attempted: false, refunded: false } without touching Stripe or
        // the DB, so Part 1 above is fully standalone.
        let refundOutcome: DeadInvoiceRefundOutcome = {
          attempted: false,
          refunded: false,
          reason: 'NOT_ATTEMPTED (no PaymentIntent on the Stripe session)',
        };

        if (paymentIntentId && ctx.paymentIntent) {
          try {
            refundOutcome = await attemptDeadInvoiceRefund({
              invoiceId: invoice.id,
              invoiceStatus: invoice.status,
              itemIds: invoice.itemIds,
              saleId: invoice.saleId,
              shopperUserId: invoice.shopperUserId,
              invoiceTotalCents: invoice.totalAmount,
              paymentIntentId,
              chargeAmountReceivedCents:
                typeof ctx.paymentIntent.amount_received === 'number'
                  ? ctx.paymentIntent.amount_received
                  : 0,
              amountRefundedCents:
                typeof ctx.paymentIntent.amount_refunded === 'number'
                  ? ctx.paymentIntent.amount_refunded
                  : 0,
              paymentIntentStatus: String(ctx.paymentIntent.status ?? 'unknown'),
              isDirectCharge: ctx.isDirectCharge,
              stripeAccount: ctx.stripeAccount,
              deadSince: invoice.updatedAt,
            });
          } catch (refundErr: any) {
            refundOutcome = {
              attempted: true,
              refunded: false,
              reason: `ERROR: ${refundErr?.message ?? refundErr}`,
            };
            console.error(
              `[deadInvoicePaidSweep] Auto-refund threw for invoice=${invoice.id} pi=${paymentIntentId}:`,
              refundErr
            );
          }
        }

        if (refundOutcome.refunded) refunded++;

        // The alert fires on EVERY paid-dead invoice regardless of refund outcome --
        // detection is the product here, the refund is an optional extra. This ordering
        // also means a refund that silently failed is still visible in Sentry.
        reportPaidDeadInvoice({
          invoiceId: invoice.id,
          invoiceStatus: invoice.status,
          sessionId: invoice.stripeSessionId!,
          paymentIntentId,
          amountCents,
          saleId: invoice.saleId,
          shopperUserId: invoice.shopperUserId,
          stripeAccount: ctx.stripeAccount,
          isDirectCharge: ctx.isDirectCharge,
          refundOutcome,
        });
      } catch (err: any) {
        errors++;
        if (isResourceMissing(err)) {
          notFound++;
          console.warn(
            `[deadInvoicePaidSweep] Session ${invoice.stripeSessionId} for invoice ${invoice.id} not found on the platform account${invoice.sale?.organizer?.stripeConnectId ? ' or the organizer connected account' : ' (organizer has no connected account on file)'} -- skipping.`
          );
        } else {
          console.error(
            `[deadInvoicePaidSweep] Failed to check invoice ${invoice.id} (session=${invoice.stripeSessionId}) -- will retry next run:`,
            err?.message ?? err
          );
        }
      }
    }

    console.log(
      `[deadInvoicePaidSweep] Done. ${candidates.length} checked, ${paidDead} PAID-DEAD-INVOICE found, ${refunded} auto-refunded, ${notFound} session not found, ${errors} error(s).`
    );
  } catch (error) {
    console.error('[deadInvoicePaidSweep] Error:', error);
  }
};

// Hourly at :07. Deliberately NOT on the crowded 10-minute grid (:01 purchaseExpiryJob,
// :02 invoiceExpiryJob, :04/:06 boothCartAbandonmentSweep/posStrandedSaleReconcile):
// this sweep makes one-to-two Stripe calls per dead invoice in a 30-day window, so an
// hourly cadence keeps the Stripe call volume bounded. Detection latency of up to an
// hour is irrelevant -- by definition nothing else was ever going to notice at all.
// :07 is unused across packages/backend/src/jobs (verified by enumerating every
// cron.schedule expression in that directory).
cron.schedule('7 * * * *', cronGuard({ jobName: 'deadInvoicePaidSweepJob' }, async () => {
  await sweepDeadInvoicesForPayment();
}));

console.log(
  `[deadInvoicePaidSweep] Registered -- runs hourly at :07, lookback ${LOOKBACK_DAYS}d, auto-refund ${deadInvoiceAutoRefundEnabled() ? 'ENABLED' : 'DISABLED (default)'}.`
);
