/**
 * boostService.ts — Unified BoostPurchase service (XP, or Square cash rail)
 * Phase 2b: ADR: claude_docs/feature-notes/ADR-featured-boost-dual-rail-S418.md
 *
 * Payment rails:
 *   XP     → xpService.spendXp → BoostPurchase status=ACTIVE immediately
 *   SQUARE → platform-level Square CreatePayment (getSquarePlatformClient(), synchronous,
 *            no organizer involved) → BoostPurchase status=ACTIVE immediately on success.
 *            Added when Square replaced Stripe as FindA.Sale's only payment processor;
 *            covers the case a user is short on XP and pays the cash price instead.
 *   STRIPE → permanently blocked (FindA.Sale's Stripe platform account is permanently
 *            closed). Kept only so a raw/stale API caller gets a clean 503 instead of
 *            a guaranteed Stripe-account error.
 *
 * XP rail is wrapped in a Prisma $transaction so ledger and BoostPurchase land atomically.
 * SQUARE rail creates the BoostPurchase row only AFTER a successful Square charge (no
 * PENDING placeholder needed -- Square's CreatePayment is synchronous, unlike Stripe's).
 */

import { prisma } from '../lib/prisma';
import { spendXp, awardXp } from './xpService';
import { getBoostPrice, getEffectiveDurationDays } from './boostPricing';
import { getStripe } from '../utils/stripe';
import { getSquarePlatformClient, getPlatformSquareLocationId } from '../utils/square';
import { toSquareMoney, buildSquareIdempotencyKey } from './squarePaymentService';
import { SquareError } from 'square';
import { BoostType, PaymentMethod } from '@prisma/client';
import { createNotification } from '../lib/notificationService';

export interface PurchaseBoostParams {
  boostType: BoostType;
  targetType?: string;
  targetId?: string;
  paymentMethod: PaymentMethod;
  durationDays?: number;
  // Square Web Payments SDK card token (client.payments.card().tokenize() result) --
  // required when paymentMethod === 'SQUARE'. Square's CreatePayment has no
  // pre-create-then-confirm primitive the way Stripe's clientSecret does, so the charge
  // is created synchronously from this token, same convention as
  // squarePosPaymentAdapter.ts / squareVendorBoothCartService.ts.
  sourceId?: string;
}

export interface PurchaseBoostResult {
  boostPurchase: {
    id: string;
    boostType: BoostType;
    status: string;
    expiresAt: Date;
    activatedAt: Date;
  };
  newXpBalance?: number;
  clientSecret?: string;
}

/**
 * Purchase a boost using XP or the Square cash rail (STRIPE is permanently blocked).
 *
 * XP rail: validates balance, deducts XP, creates ACTIVE BoostPurchase atomically.
 * Square rail: charges the card synchronously against FindA.Sale's own platform Square
 *   account, then creates an ACTIVE BoostPurchase (no PENDING/webhook step -- Square's
 *   CreatePayment already returns the final COMPLETED/declined result in this same call).
 */
export async function purchaseBoost(
  userId: string,
  params: PurchaseBoostParams
): Promise<PurchaseBoostResult> {
  const { boostType, targetType, targetId, paymentMethod, durationDays } = params;
  // (params.sourceId is read directly in the SQUARE rail below, only needed there.)

  const pricing = getBoostPrice(boostType, durationDays);
  if (!pricing) {
    throw new Error(`[boostService] Unknown boost type: ${boostType}`);
  }

  // SECURITY FIX (findasale-hacker adversarial pass, Square boost cash-rail dispatch):
  // getBoostPrice only ever special-cases ONE specific (boostType, durationDays) combo
  // (EVENT_SPONSORSHIP + 14) to select a different priced tier -- for every other
  // combination it silently ignores durationDays for pricing purposes, while
  // getEffectiveDurationDays (below) trusted a client-supplied durationDays completely
  // verbatim when computing the real expiresAt. A client could request, say,
  // HAUL_VISIBILITY with durationDays=36500 (or even 0, which one of the expiresAt
  // branches below treats as "permanent") and be charged the normal 7-day price for a
  // ~100-year boost -- harmless while the cash rail was blocked (it only ever spent a
  // user's own XP), but a real pay-a-few-cents-get-decades-of-placement exploit now that
  // a live cash rail (SQUARE) exists. Fail closed: the only durationDays value ever
  // allowed through is the one getBoostPrice actually priced (its own default, or the
  // one special-cased combo) -- never trust it for expiresAt beyond that.
  if (durationDays != null && durationDays !== pricing.durationDays) {
    throw new Error(`INVALID_DURATION_DAYS: durationDays must be ${pricing.durationDays} for ${boostType}.`);
  }

  if (paymentMethod !== 'XP' && !pricing.cashRailAvailable) {
    throw new Error(`[boostService] ${boostType} is XP-only. Cash rail not available.`);
  }

  // Stripe removal (2026-09-12) + Square cash rail (added when Square replaced Stripe as
  // FindA.Sale's ONLY payment processor): the old STRIPE rail always attempted a live
  // Stripe PaymentIntent against FindA.Sale's permanently-closed Stripe platform account --
  // still blocked unconditionally below, and always will be (that account can never be
  // used again). PaymentMethod (schema.prisma) now has XP/STRIPE/SQUARE -- the real cash
  // rail lives in the SQUARE branch further down. Blocked before any BoostPurchase row is
  // created (avoids littering the table with permanently-stuck rows for a payment method
  // that can never succeed).
  if (paymentMethod === 'STRIPE') {
    throw new Error('STRIPE_UNAVAILABLE: This payment method is no longer available. Please use XP or pay by card (Square) instead.');
  }

  const effectiveDuration = getEffectiveDurationDays(boostType, durationDays);
  const activatedAt = new Date();
  const expiresAt = new Date(activatedAt);

  if (boostType === 'SALE_BUMP') {
    // SALE_BUMP is a 1-hour bump — set expiry to 1 hour from now
    expiresAt.setTime(activatedAt.getTime() + 60 * 60 * 1000);
  } else if (effectiveDuration === 999) {
    // Sale-duration boost — set a far-future expiry; caller or cron will correct when sale closes
    expiresAt.setFullYear(expiresAt.getFullYear() + 2);
  } else if (effectiveDuration === 0 || pricing.durationDays === 0) {
    // Permanent boost — set expiry to 100 years from now
    expiresAt.setFullYear(expiresAt.getFullYear() + 100);
  } else {
    expiresAt.setDate(expiresAt.getDate() + effectiveDuration);
  }

  // ─── XP RAIL ─────────────────────────────────────────────────────────────
  if (paymentMethod === 'XP') {
    // Use Prisma $transaction to atomically deduct XP and create BoostPurchase
    const result = await prisma.$transaction(async (tx) => {
      // Check XP balance
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { guildXp: true },
      });

      if (!user || user.guildXp < pricing.xpCost) {
        throw new Error(`INSUFFICIENT_XP:${pricing.xpCost}`);
      }

      // Deduct XP
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { guildXp: { decrement: pricing.xpCost } },
      });

      // Log XP transaction
      await tx.pointsTransaction.create({
        data: {
          userId,
          type: `BOOST_${boostType}`,
          points: -pricing.xpCost,
          description: `XP boost: ${pricing.label}`,
        },
      });

      // Create ACTIVE BoostPurchase
      const boost = await tx.boostPurchase.create({
        data: {
          userId,
          boostType,
          targetType: targetType ?? null,
          targetId: targetId ?? null,
          paymentMethod: 'XP',
          xpCost: pricing.xpCost,
          durationDays: effectiveDuration,
          activatedAt,
          expiresAt,
          status: 'ACTIVE',
        },
        select: { id: true, boostType: true, status: true, expiresAt: true, activatedAt: true },
      });

      return { boost, newXpBalance: updatedUser.guildXp };
    });

    return {
      boostPurchase: result.boost,
      newXpBalance: result.newXpBalance,
    };
  }

  // ─── SQUARE RAIL ───────────────────────────────────────────────────────
  // Square-replaces-Stripe boost cash rail. Platform-level charge (getSquarePlatformClient(),
  // FindA.Sale's OWN Square account) -- NEVER a connected organizer's account, since a boost
  // purchase has no organizer/sale party to split revenue with (unlike checkout/POS/booth-cart).
  // Square's CreatePayment is synchronous (no clientSecret/confirm step, no webhook), so --
  // unlike the STRIPE rail below -- the BoostPurchase row is created ACTIVE only AFTER a
  // successful charge, mirroring the XP rail's atomicity rather than the Stripe rail's
  // PENDING-then-webhook shape. Idempotency key is scoped to the card token (see comment
  // below), not the static purchase parameters -- deliberately different from the other
  // Square call sites in this codebase, see that comment for why.
  if (paymentMethod === 'SQUARE') {
    if (!params.sourceId) {
      throw new Error('SQUARE_SOURCE_ID_REQUIRED: A card is required to complete this purchase.');
    }

    // SECURITY FIX (findasale-hacker adversarial pass): do NOT key this off static
    // business parameters (userId+boostType+target+duration) the way the STRIPE rail's
    // idempotencyKey above does -- Square idempotency keys are honored for a long window,
    // so a legitimate SECOND purchase of the identical boost type for the identical target
    // (e.g. renewing a HAUL_VISIBILITY boost after the first one expires) would compute the
    // EXACT SAME key, and Square would hand back the FIRST payment instead of charging
    // again. That would then collide with squarePaymentId's @unique constraint below,
    // trip the auto-refund safety net, and incorrectly refund the user's ORIGINAL,
    // already-fulfilled purchase. Square's card sourceId is a single-use token minted
    // fresh per tokenize() call (Web Payments SDK) -- i.e. naturally unique per real
    // purchase ATTEMPT, and stable across a same-attempt client retry (a dropped response
    // resubmitted with the same already-tokenized sourceId) -- exactly the idempotency
    // boundary this needs.
    const idempotencyKey = buildSquareIdempotencyKey(['boost', userId, params.sourceId]);

    const client = getSquarePlatformClient();
    let paymentId: string;
    try {
      const response = await client.payments.create({
        idempotencyKey,
        sourceId: params.sourceId,
        amountMoney: toSquareMoney(pricing.stripeAmountCents),
        locationId: getPlatformSquareLocationId(),
        autocomplete: true,
        referenceId: `boost-${userId}`.slice(0, 40),
        note: `FindA.Sale Boost: ${pricing.label}`,
      } as any);
      const payment = (response as any)?.payment;
      if (!payment?.id || payment.status !== 'COMPLETED') {
        throw new Error(
          'SQUARE_DECLINED: Your card was declined. Please check your card details or try a different card.'
        );
      }
      paymentId = payment.id;
    } catch (err: unknown) {
      if (err instanceof SquareError) {
        const first = (err as any).errors?.[0];
        console.warn(
          `[boostService] Square CreatePayment decline/error: ${first?.code || 'SQUARE_ERROR'} -- ${first?.detail || err.message}`
        );
        throw new Error(
          'SQUARE_DECLINED: Your card was declined. Please check your card details or try a different card.'
        );
      }
      if (err instanceof Error && err.message.startsWith('SQUARE_DECLINED:')) throw err;
      console.error('[boostService] Square CreatePayment failed:', err);
      throw new Error('SQUARE_PAYMENT_FAILED: Failed to process payment. Please try again.');
    }

    let boost: PurchaseBoostResult['boostPurchase'];
    try {
      boost = await prisma.boostPurchase.create({
        data: {
          userId,
          boostType,
          targetType: targetType ?? null,
          targetId: targetId ?? null,
          paymentMethod: 'SQUARE',
          squareAmountCents: pricing.stripeAmountCents,
          squarePaymentId: paymentId,
          durationDays: effectiveDuration,
          activatedAt,
          expiresAt,
          status: 'ACTIVE',
        },
        select: { id: true, boostType: true, status: true, expiresAt: true, activatedAt: true },
      });
    } catch (dbErr) {
      // Square already took the money at this point (payment.status === 'COMPLETED' above) --
      // if the BoostPurchase row itself fails to write (DB error, unexpected unique-constraint
      // collision), never leave a charged card with nothing to show for it. Best-effort refund
      // + loud log, then surface a clean error rather than silently eating the failure.
      console.error(
        `[boostService] BoostPurchase row create failed AFTER a successful Square charge (paymentId=${paymentId}, userId=${userId}) -- attempting an automatic refund:`,
        dbErr
      );
      try {
        await client.refunds.refundPayment({
          idempotencyKey: buildSquareIdempotencyKey(['boost-autorefund', paymentId]),
          paymentId,
          amountMoney: toSquareMoney(pricing.stripeAmountCents),
        });
        console.error(`[boostService] Auto-refunded orphaned Square boost payment ${paymentId} for userId=${userId}.`);
      } catch (refundErr) {
        console.error(
          `[boostService] AUTO-REFUND FAILED for orphaned Square boost payment ${paymentId} (userId=${userId}) -- needs manual review/refund:`,
          refundErr
        );
      }
      throw new Error('SQUARE_PAYMENT_FAILED: Your card was charged but the boost could not be activated. It has been automatically refunded -- please try again.');
    }

    return { boostPurchase: boost };
  }

  // ─── STRIPE RAIL ───────────────────────────────────────────────────────
  // Idempotency fix (findasale-dev, architect-approved): this flow is
  // authenticated-only — boostController.ts buyBoost() 401s without req.user, and
  // POST /api/boosts/purchase (routes/boosts.ts) requires the `authenticate`
  // middleware. There is no guest path here (unlike guest checkout in
  // stripeController.ts createPaymentIntent), so a stable key can be built purely
  // from userId + target + tier — no per-request random suffix needed. Mirrors the
  // `pi-${itemId}-${req.user.id}${couponSuffix}` pattern in stripeController.ts
  // createPaymentIntent (~L642-648).
  const idempotencyKey = `boost-${userId}-${boostType}-${targetType ?? 'none'}-${targetId ?? 'none'}-${effectiveDuration}`;

  // DB-level guard (defense-in-depth alongside the Stripe idempotencyKey — mirrors
  // the reuse-existing-row pattern in stripeController.ts createPaymentIntent around
  // its stripePaymentIntentId lookup, "BUG 1 fix"): if a recent PENDING
  // BoostPurchase already exists for this exact user+target+tier, reuse it instead
  // of creating a duplicate row. Window is generous (1h) since a legitimate re-buy
  // of the identical boost within that window is rare and the row will otherwise
  // have flipped to ACTIVE/EXPIRED by then.
  const RECENT_PENDING_WINDOW_MS = 60 * 60 * 1000;
  const existingPending = await prisma.boostPurchase.findFirst({
    where: {
      userId,
      boostType,
      targetType: targetType ?? null,
      targetId: targetId ?? null,
      paymentMethod: 'STRIPE',
      status: 'PENDING',
      createdAt: { gte: new Date(Date.now() - RECENT_PENDING_WINDOW_MS) },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      boostType: true,
      status: true,
      expiresAt: true,
      activatedAt: true,
      stripePaymentIntentId: true,
    },
  });

  // Create PENDING BoostPurchase FIRST — prevents race condition where webhook
  // fires before the row exists (ADR Risk R1) — unless a recent one already exists.
  const pendingBoost =
    existingPending ??
    (await prisma.boostPurchase.create({
      data: {
        userId,
        boostType,
        targetType: targetType ?? null,
        targetId: targetId ?? null,
        paymentMethod: 'STRIPE',
        stripeAmountCents: pricing.stripeAmountCents,
        durationDays: effectiveDuration,
        activatedAt,
        expiresAt,
        status: 'PENDING',
      },
      select: {
        id: true,
        boostType: true,
        status: true,
        expiresAt: true,
        activatedAt: true,
        stripePaymentIntentId: true,
      },
    }));

  // Create the Stripe PaymentIntent using the stable idempotencyKey — a genuine
  // retry (same user, same target, same tier) returns the SAME PaymentIntent from
  // Stripe instead of minting a new one. If this exact BoostPurchase row already has
  // a PaymentIntent attached (reused row above), retrieve that PI directly rather
  // than calling create again.
  const stripe = getStripe();
  const paymentIntent = pendingBoost.stripePaymentIntentId
    ? await stripe.paymentIntents.retrieve(pendingBoost.stripePaymentIntentId)
    : await stripe.paymentIntents.create(
        {
          amount: pricing.stripeAmountCents,
          currency: 'usd',
          metadata: {
            boostPurchaseId: pendingBoost.id,
            userId,
            boostType,
          },
          description: `FindA.Sale Boost: ${pricing.label}`,
        },
        { idempotencyKey }
      );

  // Store the PaymentIntent ID on the boost record (no-op if already set from a
  // prior attempt on the reused row).
  if (!pendingBoost.stripePaymentIntentId) {
    await prisma.boostPurchase.update({
      where: { id: pendingBoost.id },
      data: { stripePaymentIntentId: paymentIntent.id },
    });
  }

  return {
    boostPurchase: pendingBoost,
    clientSecret: paymentIntent.client_secret ?? undefined,
  };
}

/**
 * Refund a boost purchase.
 * XP rail: re-award XP via awardXp with BOOST_REFUND type (excluded from rank-up logic).
 * Stripe rail: creates Stripe refund via admin — not callable from user-facing API.
 */
export async function refundBoost(
  boostPurchaseId: string,
  reason: string
): Promise<void> {
  const boost = await prisma.boostPurchase.findUnique({
    where: { id: boostPurchaseId },
  });

  if (!boost) throw new Error(`[boostService] BoostPurchase ${boostPurchaseId} not found`);
  if (boost.status === 'REFUNDED') throw new Error(`[boostService] Already refunded`);

  if (boost.paymentMethod === 'XP' && boost.xpCost) {
    await awardXp(boost.userId, 'BOOST_REFUND', boost.xpCost, {
      description: `Refund for ${boost.boostType} boost`,
      // Mandatory exemption: without this flag a Hunt Pass user could spend XP
      // on a boost, refund it, and receive back MORE XP than was spent (1.5x on
      // refund) — a free-XP exploit every cycle. Refund must return exactly what
      // was paid, never multiplied.
      preMultipliedHuntPassXp: true,
    });
  } else if (boost.paymentMethod === 'STRIPE' && boost.stripePaymentIntentId) {
    const stripe = getStripe();
    await stripe.refunds.create({
      payment_intent: boost.stripePaymentIntentId,
    });
  } else if (boost.paymentMethod === 'SQUARE' && boost.squarePaymentId) {
    // Platform-level refund -- mirrors the platform-level charge above (getSquarePlatformClient(),
    // never an organizer's own token, since a boost purchase never involved an organizer account).
    const client = getSquarePlatformClient();
    await client.refunds.refundPayment({
      idempotencyKey: buildSquareIdempotencyKey(['boost-refund', boostPurchaseId]),
      paymentId: boost.squarePaymentId,
      amountMoney: toSquareMoney(boost.squareAmountCents ?? 0),
    });
  }

  await prisma.boostPurchase.update({
    where: { id: boostPurchaseId },
    data: { status: 'REFUNDED', refundedAt: new Date(), refundReason: reason },
  });
}

/**
 * Sweep expired active boosts — called by boostExpiryJob cron.
 * Returns the count of records expired.
 */
export async function expireBoosts(): Promise<number> {
  const result = await prisma.boostPurchase.updateMany({
    where: {
      status: 'ACTIVE',
      expiresAt: { lt: new Date() },
    },
    data: { status: 'EXPIRED' },
  });
  return result.count;
}

/**
 * Sweep stale PENDING boosts (Stripe rail only -- the XP rail creates ACTIVE
 * BoostPurchase rows directly and never produces PENDING, see purchaseBoost above) --
 * called by boostExpiryJob cron alongside expireBoosts().
 *
 * Fix for a confirmed gap (S1187 audit, exhaustive grep of packages/backend/src/jobs/*.ts):
 * boostExpiryJob.ts only ever swept status='ACTIVE' -> 'EXPIRED'. A Stripe-rail boost
 * that never got its webhook (payment_intent.succeeded via stripeController.ts's
 * boostPurchaseId branch, PENDING -> ACTIVE) -- buyer abandons the payment sheet, a
 * webhook delivery is lost -- stayed PENDING forever. BoostPurchase.expiresAt is NOT a
 * usable staleness signal here: it is set at PENDING-creation time to the boost's own
 * FUTURE duration (activatedAt + durationDays, which can be 1 hour, 2 years, or 100
 * years depending on boostType -- see purchaseBoost above), not an abandonment window.
 * createdAt + a fixed threshold is the correct staleness signal instead.
 *
 * Evidence-first Stripe verification (NOT a blind timeout), same philosophy as
 * invoiceExpiryJob.ts / posStrandedSaleReconcileCron.ts / purchaseExpiryJob.ts:
 *   - succeeded                                    -> missed-webhook safety net. Flip
 *     PENDING -> ACTIVE, recomputing activatedAt/expiresAt with the EXACT same logic
 *     stripeController.ts's boost-webhook branch uses (durationDays===999 -> +2yr;
 *     durationDays<=1 -> +1hr; else +durationDays).
 *   - canceled / requires_payment_method /
 *     requires_confirmation                        -> genuinely abandoned. Flip
 *     PENDING -> FAILED.
 *   - anything else (requires_action, requires_capture, processing)
 *                                                   -> still potentially in flight,
 *     left alone, re-checked next run.
 *
 * Race safety: the PENDING -> ACTIVE/FAILED flip is an atomic conditional `updateMany`
 * (WHERE status = 'PENDING') so a webhook resolving the same boost mid-sweep always
 * wins the race. BoostPurchase.stripePaymentIntentId IS @unique (unlike
 * Purchase.stripePaymentIntentId), so no PI-grouping is needed here -- one boost per PI.
 *
 * Kill-switch: set BOOST_EXPIRY_RECLAIM_DISABLED=1 to make this sweep early-return
 * (rollback lever independent of expireBoosts()'s ACTIVE->EXPIRED sweep, which keeps
 * running).
 *
 * Threshold: BOOST_PENDING_EXPIRY_HOURS (default 2).
 */
export async function reclaimPendingBoosts(): Promise<{ activated: number; failed: number }> {
  if (process.env.BOOST_EXPIRY_RECLAIM_DISABLED === '1') {
    console.log('[boostService] reclaimPendingBoosts disabled via BOOST_EXPIRY_RECLAIM_DISABLED=1 -- skipping.');
    return { activated: 0, failed: 0 };
  }

  const thresholdHours = parseFloat(process.env.BOOST_PENDING_EXPIRY_HOURS ?? '2');
  const cutoff = new Date(Date.now() - thresholdHours * 60 * 60 * 1000);

  const candidates = await prisma.boostPurchase.findMany({
    where: { status: 'PENDING', createdAt: { lt: cutoff } },
    select: { id: true, stripePaymentIntentId: true, userId: true, boostType: true, durationDays: true, createdAt: true },
  });

  if (candidates.length === 0) return { activated: 0, failed: 0 };

  console.log(`[boostService] reclaimPendingBoosts: checking ${candidates.length} PENDING BoostPurchase row(s) older than ${thresholdHours}h.`);

  let activated = 0;
  let failed = 0;
  let skippedNoPi = 0;

  const stripe = getStripe();
  const ABANDONED_STATUSES = new Set(['canceled', 'requires_payment_method', 'requires_confirmation']);

  for (const boost of candidates) {
    try {
      if (!boost.stripePaymentIntentId) {
        // Should not happen -- purchaseBoost creates the PENDING row, then the PI, then
        // stores the PI id in a follow-up update. A crash between those two steps could
        // leave this null. No Stripe ground truth means no safe verification -- log and
        // skip rather than guess.
        console.warn(`[boostService] reclaimPendingBoosts: NO-PI-SKIPPED boost=${boost.id} createdAt=${boost.createdAt.toISOString()} -- expired PENDING with no stripePaymentIntentId. NOT auto-reverting; needs manual review.`);
        skippedNoPi++;
        continue;
      }

      const paymentIntent = await stripe.paymentIntents.retrieve(boost.stripePaymentIntentId);

      if (paymentIntent.status === 'succeeded') {
        // Missed-webhook safety net -- mirror stripeController.ts's boost-webhook
        // expiresAt calc exactly (see header comment).
        const now = new Date();
        const expiresAt = new Date(now);
        if (boost.durationDays === 999) {
          expiresAt.setFullYear(expiresAt.getFullYear() + 2);
        } else if (boost.durationDays <= 1) {
          expiresAt.setTime(now.getTime() + 60 * 60 * 1000);
        } else {
          expiresAt.setDate(expiresAt.getDate() + boost.durationDays);
        }

        const result = await prisma.boostPurchase.updateMany({
          where: { id: boost.id, status: 'PENDING' },
          data: { status: 'ACTIVE', activatedAt: now, expiresAt },
        });
        if (result.count > 0) {
          activated++;
          console.error(`[boostService] reclaimPendingBoosts: STRANDED-PAID-RECLAIMED boost=${boost.id} (${boost.boostType}) pi=${boost.stripePaymentIntentId} -- Stripe shows succeeded but still PENDING past ${thresholdHours}h (webhook missed). Flipped to ACTIVE.`);
        }
      } else if (ABANDONED_STATUSES.has(paymentIntent.status)) {
        const result = await prisma.boostPurchase.updateMany({
          where: { id: boost.id, status: 'PENDING' },
          data: { status: 'FAILED' },
        });
        if (result.count > 0) {
          failed++;
          console.log(`[boostService] reclaimPendingBoosts: EXPIRED-RECLAIMED boost=${boost.id} (${boost.boostType}) pi=${boost.stripePaymentIntentId} stripeStatus=${paymentIntent.status} -- abandoned past ${thresholdHours}h. Flipped to FAILED.`);

          if (boost.userId) {
            await createNotification({
              userId: boost.userId,
              type: 'boost_purchase_expired',
              title: 'Boost purchase not completed',
              body: 'Your boost checkout was not completed in time, so the payment attempt was cancelled. You can try again anytime.',
              channel: 'OPERATIONAL',
            }).catch(err => console.error(`[boostService] reclaimPendingBoosts: failed to notify user ${boost.userId} for boost=${boost.id}:`, err));
          }
        }
      } else {
        console.log(`[boostService] reclaimPendingBoosts: IN-FLIGHT-SKIPPED boost=${boost.id} pi=${boost.stripePaymentIntentId} stripeStatus=${paymentIntent.status} -- not a terminal state yet, retrying next run.`);
      }
    } catch (err: any) {
      console.error(`[boostService] reclaimPendingBoosts: failed to reclaim boost ${boost.id} -- will retry next run:`, err?.message ?? err);
    }
  }

  console.log(`[boostService] reclaimPendingBoosts: ${activated} ACTIVE (missed webhook), ${failed} FAILED (abandoned), ${skippedNoPi} NO-PI skipped.`);
  return { activated, failed };
}

/**
 * Get all currently active boosts for a given targetType.
 * Used by SaleMap, haul feed, etc. to render "Featured" badges.
 * Scarcity cap: max 5 active SALE_BUMP boosts per query (env-var adjustable).
 */
export async function getActiveBoosts(targetType?: string) {
  const MAX_FEATURED = parseInt(process.env.MAX_FEATURED_BOOSTS ?? '5', 10);

  const boosts = await prisma.boostPurchase.findMany({
    where: targetType
      ? { status: 'ACTIVE', expiresAt: { gt: new Date() }, targetType }
      : { status: 'ACTIVE', expiresAt: { gt: new Date() } },
    orderBy: { activatedAt: 'desc' },
    take: targetType === 'SALE' ? MAX_FEATURED : undefined,
    select: {
      id: true,
      boostType: true,
      targetType: true,
      targetId: true,
      expiresAt: true,
      activatedAt: true,
    },
  });

  return boosts;
}
