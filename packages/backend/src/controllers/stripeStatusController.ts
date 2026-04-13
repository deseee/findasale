import { Response } from 'express';
import { getStripe } from '../utils/stripe';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

export const getAccountStatus = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
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
