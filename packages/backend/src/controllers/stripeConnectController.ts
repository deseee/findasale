import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import {
  createConnectAccount,
  createOnboardingLink,
  getAccountStatus,
  payConsignorViaACH,
  updateConsignorOnboardingStatus,
} from '../services/stripeConnectService';
import { Decimal } from '@prisma/client/runtime/library';

// GET /api/stripe-connect/status/:consignorId
export const getConsignorPayoutStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { consignorId } = req.params;
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    // Verify organizer owns this consignor
    const consignor = await prisma.consignor.findFirst({
      where: {
        id: consignorId,
        workspace: {
          ownerId: userId,
        },
      },
    });

    if (!consignor) {
      return res.status(404).json({ message: 'Consignor not found or access denied.' });
    }

    if (!consignor.stripeAccountId) {
      return res.json({
        consignorId: consignor.id,
        stripeAccountId: null,
        stripeOnboarded: false,
        accountStatus: null,
      });
    }

    // Fetch account status from Stripe
    const status = await getAccountStatus(consignor.stripeAccountId);

    return res.json({
      consignorId: consignor.id,
      stripeAccountId: consignor.stripeAccountId,
      stripeOnboarded: consignor.stripeOnboarded,
      accountStatus: status,
    });
  } catch (error) {
    console.error('getConsignorPayoutStatus error:', error);
    return res.status(500).json({ message: 'Failed to fetch consignor status.' });
  }
};

// POST /api/stripe-connect/onboard/:consignorId
export const initiateConsignorOnboarding = async (req: AuthRequest, res: Response) => {
  try {
    const { consignorId } = req.params;
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    // Verify organizer owns this consignor
    const consignor = await prisma.consignor.findFirst({
      where: {
        id: consignorId,
        workspace: {
          ownerId: userId,
        },
      },
    });

    if (!consignor) {
      return res.status(404).json({ message: 'Consignor not found or access denied.' });
    }

    let accountId = consignor.stripeAccountId;

    // Create account if it doesn't exist
    if (!accountId) {
      accountId = await createConnectAccount(consignor);
    }

    // Build return/refresh URLs
    const frontendBaseUrl = process.env.FRONTEND_URL || 'https://finda.sale';
    const returnUrl = `${frontendBaseUrl}/organizer/stripe-connect?consignorId=${consignorId}&success=true`;
    const refreshUrl = `${frontendBaseUrl}/organizer/stripe-connect?consignorId=${consignorId}&refresh=true`;

    // Create onboarding link
    const onboardingUrl = await createOnboardingLink(accountId, returnUrl, refreshUrl);

    return res.json({
      consignorId,
      accountId,
      onboardingUrl,
    });
  } catch (error) {
    console.error('initiateConsignorOnboarding error:', error);
    return res.status(500).json({ message: 'Failed to initiate onboarding.' });
  }
};

// GET /api/stripe-connect/return/:consignorId
export const handleConnectReturn = async (req: AuthRequest, res: Response) => {
  try {
    const { consignorId } = req.params;
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    // Verify organizer owns this consignor
    const consignor = await prisma.consignor.findFirst({
      where: {
        id: consignorId,
        workspace: {
          ownerId: userId,
        },
      },
    });

    if (!consignor || !consignor.stripeAccountId) {
      return res.status(404).json({ message: 'Consignor not found or not initialized.' });
    }

    // Update onboarding status
    const status = await updateConsignorOnboardingStatus(consignorId, consignor.stripeAccountId);

    return res.json({
      consignorId,
      stripeOnboarded: status.chargesEnabled,
      accountStatus: status,
    });
  } catch (error) {
    console.error('handleConnectReturn error:', error);
    return res.status(500).json({ message: 'Failed to verify onboarding status.' });
  }
};

// POST /api/stripe-connect/pay/:consignorId
export const payConsignor = async (req: AuthRequest, res: Response) => {
  try {
    const { consignorId } = req.params;
    const userId = req.user?.id;
    const { settlementId, amountCents, description } = req.body;

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    if (!settlementId || !amountCents) {
      return res.status(400).json({ message: 'settlementId and amountCents required.' });
    }

    // Verify TEAMS tier
    const organizer = await prisma.organizer.findFirst({
      where: { userId },
      select: { id: true, subscriptionTier: true, stripeConnectAccountId: true },
    });

    if (!organizer) return res.status(404).json({ message: 'Organizer not found.' });
    if (organizer.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ message: 'ACH Payouts require TEAMS tier.' });
    }

    // Verify consignor exists and is onboarded
    const consignor = await prisma.consignor.findFirst({
      where: {
        id: consignorId,
        workspace: {
          ownerId: userId,
        },
      },
    });

    if (!consignor) return res.status(404).json({ message: 'Consignor not found.' });
    if (!consignor.stripeOnboarded || !consignor.stripeAccountId) {
      return res.status(400).json({ message: 'Consignor not onboarded for ACH payouts.' });
    }

    // Verify settlement exists and belongs to this organizer
    const settlement = await prisma.saleSettlement.findFirst({
      where: {
        id: settlementId,
        sale: {
          organizer: { userId },
        },
      },
      select: { id: true, netProceeds: true },
    });

    if (!settlement) return res.status(404).json({ message: 'Settlement not found or access denied.' });

    // Verify amount doesn't exceed settlement proceeds
    const netProceeds = Number(settlement.netProceeds);
    if (amountCents > netProceeds * 100) {
      return res.status(400).json({ message: 'Payout amount exceeds settlement proceeds.' });
    }

    // Execute Stripe transfer
    const transfer = await payConsignorViaACH(
      consignor.stripeAccountId,
      amountCents,
      description || `Consignor payout for settlement ${settlementId}`,
      organizer.stripeConnectAccountId || undefined
    );

    // Create ConsignorPayout record
    const payout = await prisma.consignorPayout.create({
      data: {
        consignorId,
        saleId: undefined,
        totalSales: new Decimal(0),
        commissionAmount: new Decimal(amountCents / 100),
        netPayout: new Decimal(amountCents / 100),
        method: 'ACH',
        stripeTransferId: transfer.transferId,
        paidAt: new Date(),
        notes: description || null,
      },
    });

    return res.json({
      payoutId: payout.id,
      consignorId,
      amountFormatted: transfer.amountFormatted,
      transferId: transfer.transferId,
      status: transfer.status,
      paidAt: payout.paidAt?.toISOString(),
    });
  } catch (error) {
    console.error('payConsignor error:', error);
    return res.status(500).json({ message: 'Failed to process ACH payout.' });
  }
};
