// V2: Instant payouts — balance, triggered payouts, and payout schedule management
import { Response } from 'express';
import { getStripe } from '../utils/stripe';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

/** Retrieve the organizer's Stripe Connect account ID, or null if not yet linked */
const getOrganizerStripeId = async (userId: string): Promise<string | null> => {
  const organizer = await prisma.organizer.findUnique({
    where: { userId },
    select: { stripeConnectId: true },
  });
  return organizer?.stripeConnectId ?? null;
};

/**
 * GET /api/stripe/balance
 * Returns the organizer's Stripe Connect available + pending balance in USD.
 */
export const getBalance = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ORGANIZER') {
      return res.status(403).json({ message: 'Organizer access required' });
    }

    const connectId = await getOrganizerStripeId(req.user.id);
    if (!connectId) {
      return res.status(400).json({ message: 'Stripe account not connected. Complete onboarding first.' });
    }

    const stripe = getStripe();
    const balance = await stripe.balance.retrieve({ stripeAccount: connectId });

    const usdAvailable = balance.available.find(b => b.currency === 'usd');
    const usdPending = balance.pending.find(b => b.currency === 'usd');

    res.json({
      available: (usdAvailable?.amount ?? 0) / 100,
      pending: (usdPending?.amount ?? 0) / 100,
    });
  } catch (error) {
    console.error('getBalance error:', error);
    res.status(500).json({ message: 'Failed to retrieve balance' });
  }
};

/**
 * GET /api/stripe/payout-schedule
 * Returns the organizer's current payout schedule setting.
 */
export const getPayoutSchedule = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ORGANIZER') {
      return res.status(403).json({ message: 'Organizer access required' });
    }

    const connectId = await getOrganizerStripeId(req.user.id);
    if (!connectId) {
      return res.status(400).json({ message: 'Stripe account not connected' });
    }

    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(connectId);
    const schedule = account.settings?.payouts?.schedule;

    res.json({
      interval: schedule?.interval ?? 'daily',
      weeklyAnchor: (schedule as any)?.weekly_anchor ?? null,
      monthlyAnchor: (schedule as any)?.monthly_anchor ?? null,
    });
  } catch (error) {
    console.error('getPayoutSchedule error:', error);
    res.status(500).json({ message: 'Failed to retrieve payout schedule' });
  }
};

/**
 * PATCH /api/stripe/payout-schedule
 * Body: { interval: 'daily' | 'weekly' | 'monthly' | 'manual' }
 * Updates how often Stripe automatically sends funds to the organizer's bank.
 * 'manual' means no automatic payouts — organizer requests them via createPayout.
 */
export const updatePayoutSchedule = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ORGANIZER') {
      return res.status(403).json({ message: 'Organizer access required' });
    }

    const connectId = await getOrganizerStripeId(req.user.id);
    if (!connectId) {
      return res.status(400).json({ message: 'Stripe account not connected' });
    }

    const { interval } = req.body;
    const validIntervals = ['daily', 'weekly', 'monthly', 'manual'];
    if (!validIntervals.includes(interval)) {
      return res.status(400).json({ message: `interval must be one of: ${validIntervals.join(', ')}` });
    }

    const stripe = getStripe();
    const account = await stripe.accounts.update(connectId, {
      settings: {
        payouts: {
          schedule: { interval: interval as any },
        },
      },
    });

    const schedule = account.settings?.payouts?.schedule;
    res.json({
      interval: schedule?.interval,
      weeklyAnchor: (schedule as any)?.weekly_anchor ?? null,
    });
  } catch (error) {
    console.error('updatePayoutSchedule error:', error);
    res.status(500).json({ message: 'Failed to update payout schedule' });
  }
};

/**
 * POST /api/stripe/payout
 * Body: { amount: number (dollars), method?: 'standard' | 'instant' }
 * Triggers an on-demand payout from the organizer's Stripe Connect balance to their bank.
 * 'instant' requires an eligible debit card external account; falls back gracefully if unsupported.
 */
export const createPayout = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ORGANIZER') {
      return res.status(403).json({ message: 'Organizer access required' });
    }

    const connectId = await getOrganizerStripeId(req.user.id);
    if (!connectId) {
      return res.status(400).json({ message: 'Stripe account not connected' });
    }

    const { amount, method = 'standard' } = req.body;
    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ message: 'amount must be a positive number (in dollars)' });
    }
    if (!['standard', 'instant'].includes(method)) {
      return res.status(400).json({ message: "method must be 'standard' or 'instant'" });
    }

    const stripe = getStripe();
    const payout = await stripe.payouts.create(
      {
        amount: Math.round(amount * 100), // convert dollars → cents
        currency: 'usd',
        method: method as 'standard' | 'instant',
        statement_descriptor: 'FindA.Sale Payout',
      },
      { stripeAccount: connectId }
    );

    res.json({
      id: payout.id,
      amount: payout.amount / 100,
      method: payout.method,
      status: payout.status,
      // arrival_date is a Unix timestamp; convert to ISO for the frontend
      arrivalDate: payout.arrival_date
        ? new Date(payout.arrival_date * 1000).toISOString()
        : null,
    });
  } catch (error: any) {
    // Stripe specific codes for instant payout eligibility failures
    const instantUnsupported = [
      'instant_payouts_unsupported',
      'instant_payouts_limit_exceeded',
      'instant_payouts_currency_disabled',
    ];
    if (instantUnsupported.includes(error?.code)) {
      return res.status(400).json({
        message: 'Instant payouts are not available for this account. Try a standard payout instead.',
        code: error.code,
      });
    }
    // Insufficient balance
    if (error?.code === 'balance_insufficient') {
      return res.status(400).json({ message: 'Insufficient balance for this payout amount.', code: error.code });
    }
    console.error('createPayout error:', error);
    res.status(500).json({ message: 'Failed to create payout' });
  }
};
