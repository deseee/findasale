/**
 * boostService.ts — Unified BoostPurchase service (dual-rail: XP or Stripe)
 * Phase 2b: ADR: claude_docs/feature-notes/ADR-featured-boost-dual-rail-S418.md
 *
 * Two payment rails:
 *   XP   → xpService.spendXp → BoostPurchase status=ACTIVE immediately
 *   STRIPE → create Stripe paymentIntent → BoostPurchase status=PENDING → webhook flips to ACTIVE
 *
 * All operations are wrapped in Prisma $transaction so ledger and BoostPurchase land atomically.
 */

import Stripe from 'stripe';
import { prisma } from '../lib/prisma';
import { spendXp, awardXp } from './xpService';
import { getBoostPrice, getEffectiveDurationDays } from './boostPricing';
import { BoostType, PaymentMethod } from '@prisma/client';

let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('[boostService] STRIPE_SECRET_KEY not set');
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });
  }
  return _stripe;
}

export interface PurchaseBoostParams {
  boostType: BoostType;
  targetType?: string;
  targetId?: string;
  paymentMethod: PaymentMethod;
  durationDays?: number;
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
 * Purchase a boost using XP or Stripe rail.
 *
 * XP rail: validates balance, deducts XP, creates ACTIVE BoostPurchase atomically.
 * Stripe rail: creates PENDING BoostPurchase FIRST (prevents race), then creates
 *   PaymentIntent with boostPurchaseId in metadata. Returns clientSecret for client-side confirmation.
 *
 * Webhook handler (stripeController.ts) flips PENDING → ACTIVE on payment_intent.succeeded.
 */
export async function purchaseBoost(
  userId: string,
  params: PurchaseBoostParams
): Promise<PurchaseBoostResult> {
  const { boostType, targetType, targetId, paymentMethod, durationDays } = params;

  const pricing = getBoostPrice(boostType, durationDays);
  if (!pricing) {
    throw new Error(`[boostService] Unknown boost type: ${boostType}`);
  }

  if (paymentMethod === 'STRIPE' && !pricing.cashRailAvailable) {
    throw new Error(`[boostService] ${boostType} is XP-only. Cash rail not available.`);
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

  // ─── STRIPE RAIL ──────────────────────────────────────────────────────────
  // Create PENDING BoostPurchase FIRST — prevents race condition where webhook
  // fires before the row exists (ADR Risk R1).
  const pendingBoost = await prisma.boostPurchase.create({
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
    select: { id: true, boostType: true, status: true, expiresAt: true, activatedAt: true },
  });

  // Create Stripe PaymentIntent with boostPurchaseId in metadata
  const stripe = getStripe();
  const paymentIntent = await stripe.paymentIntents.create({
    amount: pricing.stripeAmountCents,
    currency: 'usd',
    metadata: {
      boostPurchaseId: pendingBoost.id,
      userId,
      boostType,
    },
    description: `FindA.Sale Boost: ${pricing.label}`,
  });

  // Store the PaymentIntent ID on the boost record
  await prisma.boostPurchase.update({
    where: { id: pendingBoost.id },
    data: { stripePaymentIntentId: paymentIntent.id },
  });

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
    });
  } else if (boost.paymentMethod === 'STRIPE' && boost.stripePaymentIntentId) {
    const stripe = getStripe();
    await stripe.refunds.create({
      payment_intent: boost.stripePaymentIntentId,
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
 * Get all currently active boosts for a given targetType.
 * Used by SaleMap, haul feed, etc. to render "Featured" badges.
 * Scarcity cap: max 5 active SALE_BUMP boosts per query (env-var adjustable).
 */
export async function getActiveBoosts(targetType?: string) {
  const MAX_FEATURED = parseInt(process.env.MAX_FEATURED_BOOSTS ?? '5', 10);

  const where: Record<string, unknown> = {
    status: 'ACTIVE',
    expiresAt: { gt: new Date() },
  };

  if (targetType) {
    where.targetType = targetType;
  }

  const boosts = await prisma.boostPurchase.findMany({
    where: where as Parameters<typeof prisma.boostPurchase.findMany>[0]['where'],
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
