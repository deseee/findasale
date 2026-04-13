/**
 * boostController.ts — HTTP handlers for /api/boosts/*
 * Phase 2b: Dual-rail boost system
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { purchaseBoost, getActiveBoosts } from '../services/boostService';
import { getBoostPrice, BOOST_PRICING } from '../services/boostPricing';
import { prisma } from '../lib/prisma';
import { BoostType, PaymentMethod } from '@prisma/client';

// ---------------------------------------------------------------------------
// POST /api/boosts/quote — preview XP + cash price for a boost type
// ---------------------------------------------------------------------------
export const getBoostQuote = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required' });

  const { boostType, durationDays } = req.body as { boostType: string; durationDays?: number };

  if (!boostType) {
    return res.status(400).json({ message: 'boostType is required' });
  }

  const pricing = getBoostPrice(boostType, durationDays);
  if (!pricing) {
    return res.status(400).json({ message: `Unknown boost type: ${boostType}` });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { guildXp: true },
  });

  const userXpBalance = user?.guildXp ?? 0;

  return res.json({
    boostType,
    xpCost: pricing.xpCost,
    stripeAmountCents: pricing.stripeAmountCents,
    stripeAmountDollars: (pricing.stripeAmountCents / 100).toFixed(2),
    durationDays: durationDays ?? pricing.durationDays,
    cashRailAvailable: pricing.cashRailAvailable,
    label: pricing.label,
    description: pricing.description,
    userXpBalance,
    canAffordXp: userXpBalance >= pricing.xpCost,
  });
};

// ---------------------------------------------------------------------------
// POST /api/boosts/purchase — buy a boost (XP or Stripe rail)
// ---------------------------------------------------------------------------
export const buyBoost = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required' });

  const { boostType, targetType, targetId, paymentMethod, durationDays } = req.body as {
    boostType: string;
    targetType?: string;
    targetId?: string;
    paymentMethod: string;
    durationDays?: number;
  };

  if (!boostType || !paymentMethod) {
    return res.status(400).json({ message: 'boostType and paymentMethod are required' });
  }

  // Validate enum values
  const validBoostTypes = Object.keys(BOOST_PRICING);
  if (!validBoostTypes.includes(boostType)) {
    return res.status(400).json({ message: `Invalid boostType: ${boostType}` });
  }

  if (paymentMethod !== 'XP' && paymentMethod !== 'STRIPE') {
    return res.status(400).json({ message: 'paymentMethod must be XP or STRIPE' });
  }

  try {
    const result = await purchaseBoost(req.user.id, {
      boostType: boostType as BoostType,
      targetType,
      targetId,
      paymentMethod: paymentMethod as PaymentMethod,
      durationDays,
    });

    const status = paymentMethod === 'XP' ? 201 : 202;
    return res.status(status).json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    if (message.startsWith('INSUFFICIENT_XP:')) {
      const needed = message.split(':')[1];
      return res.status(400).json({
        message: `Not enough XP. This boost costs ${needed} XP.`,
        code: 'INSUFFICIENT_XP',
      });
    }

    if (message.includes('XP-only')) {
      return res.status(400).json({ message, code: 'XP_ONLY_BOOST' });
    }

    console.error('[boost] purchaseBoost error:', err);
    return res.status(500).json({ message: 'Failed to purchase boost. Please try again.' });
  }
};

// ---------------------------------------------------------------------------
// GET /api/boosts/active?targetType=SALE — active boosts for a targetType
// ---------------------------------------------------------------------------
export const listActiveBoosts = async (req: AuthRequest, res: Response) => {
  const { targetType } = req.query as { targetType?: string };

  try {
    const boosts = await getActiveBoosts(targetType);
    return res.json({ boosts });
  } catch (err) {
    console.error('[boost] listActiveBoosts error:', err);
    return res.status(500).json({ message: 'Failed to load active boosts' });
  }
};

// ---------------------------------------------------------------------------
// GET /api/boosts/me — current user's boost history
// ---------------------------------------------------------------------------
export const getMyBoosts = async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required' });

  try {
    const boosts = await prisma.boostPurchase.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        boostType: true,
        targetType: true,
        targetId: true,
        paymentMethod: true,
        xpCost: true,
        stripeAmountCents: true,
        durationDays: true,
        activatedAt: true,
        expiresAt: true,
        status: true,
        createdAt: true,
      },
    });

    return res.json({ boosts });
  } catch (err) {
    console.error('[boost] getMyBoosts error:', err);
    return res.status(500).json({ message: 'Failed to load boost history' });
  }
};
