import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { getStripe } from '../utils/stripe';

const prisma = new PrismaClient();

interface AuthRequest extends Request {
  user?: any;
}

export const getAccountStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'ORGANIZER') {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id }
    });

    if (!organizer || !organizer.stripeConnectId) {
      return res.json({
        onboarded: false,
        needsSetup: true,
        chargesEnabled: false,
        detailsSubmitted: false
      });
    }

    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(organizer.stripeConnectId);
    
    res.json({
      onboarded: account.charges_enabled && account.details_submitted,
      chargesEnabled: account.charges_enabled,
      detailsSubmitted: account.details_submitted,
      needsSetup: false
    });
  } catch (error) {
    console.error('Error fetching Stripe account status:', error);
    res.status(500).json({ message: 'Failed to fetch account status' });
  }
};
