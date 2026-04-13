import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const SHOPPER_CREDIT_AMOUNT = 5.00; // $5 store credit per referred shopper

// GET /api/shopper-referral/stats — get current user's referral stats and credit balance
export const getShopperReferralStats = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { referralCode: true, shopperCredits: true },
    });
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Ensure user has a referral code
    let referralCode = user.referralCode;
    if (!referralCode) {
      referralCode = Math.random().toString(36).substring(2, 10).toUpperCase();
      await prisma.user.update({ where: { id: req.user.id }, data: { referralCode } });
    }

    const totalReferrals = await prisma.referral.count({
      where: { referrerId: req.user.id },
    });

    const referralLink = `${process.env.FRONTEND_URL || 'https://finda.sale'}/refer/${referralCode}`;

    return res.json({
      referralCode,
      referralLink,
      totalReferrals,
      shopperCredits: user.shopperCredits,
      creditPerReferral: SHOPPER_CREDIT_AMOUNT,
    });
  } catch (err) {
    console.error('getShopperReferralStats error:', err);
    return res.status(500).json({ message: 'Failed to get referral stats' });
  }
};

// POST /api/shopper-referral/apply-credit — apply store credit to a purchase (called at checkout)
export const applyShopperCredit = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const { amount } = req.body as { amount: number };

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { shopperCredits: true },
    });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const applyAmount = Math.min(amount, user.shopperCredits);
    if (applyAmount <= 0) {
      return res.status(400).json({ message: 'No credits available' });
    }

    await prisma.user.update({
      where: { id: req.user.id },
      data: { shopperCredits: { decrement: applyAmount } },
    });

    return res.json({ applied: applyAmount, remaining: user.shopperCredits - applyAmount });
  } catch (err) {
    console.error('applyShopperCredit error:', err);
    return res.status(500).json({ message: 'Failed to apply credit' });
  }
};

// Internal: award credit to referrer when referred user makes first purchase
export const awardReferralCredit = async (referredUserId: string): Promise<void> => {
  try {
    const referral = await prisma.referral.findUnique({
      where: { referredUserId },
    });
    if (!referral) return;

    await prisma.user.update({
      where: { id: referral.referrerId },
      data: { shopperCredits: { increment: SHOPPER_CREDIT_AMOUNT } },
    });
  } catch (err) {
    console.error('awardReferralCredit error:', err);
  }
};
