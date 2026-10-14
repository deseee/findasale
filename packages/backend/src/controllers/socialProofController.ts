import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { getItemSocialProof, getSaleSocialProof } from '../services/socialProofService';
import { prisma } from '../lib/prisma';
import { isItemEmbargoedForViewer } from '../lib/saleLocationPrivacy';

/**
 * GET /api/social-proof/item/:itemId
 * Fetch social proof metrics for a single item.
 * Requires authentication.
 */
export const getItemSocialProofHandler = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    // Authenticate required
    if (!req.user || !req.user.id) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const { itemId } = req.params;

    if (!itemId) {
      res.status(400).json({ message: 'Item ID is required' });
      return;
    }

    // Early-access gate (2026-10-13): an item still inside its early-access window answers like a missing
    // one for viewers without access (its organizer and admins excepted).
    const gateItem = await prisma.item.findUnique({
      where: { id: itemId },
      select: {
        rarity: true, createdAt: true, earlyAccessUntil: true, isLegendary: true, legendaryVisibleAt: true,
        sale: { select: { organizer: { select: { userId: true } } } },
      },
    });
    if (
      gateItem &&
      req.user.role !== 'ADMIN' &&
      gateItem.sale?.organizer?.userId !== req.user.id &&
      isItemEmbargoedForViewer(gateItem, req.user)
    ) {
      res.status(404).json({ message: 'Item not found' });
      return;
    }

    const socialProof = await getItemSocialProof(itemId);

    res.json(socialProof);
  } catch (error) {
    console.error('Error fetching item social proof:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * GET /api/social-proof/sale/:saleId
 * Fetch social proof metrics for a sale.
 * Requires authentication.
 */
export const getSaleSocialProofHandler = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    // Authenticate required
    if (!req.user || !req.user.id) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const { saleId } = req.params;

    if (!saleId) {
      res.status(400).json({ message: 'Sale ID is required' });
      return;
    }

    const socialProof = await getSaleSocialProof(saleId);

    res.json(socialProof);
  } catch (error) {
    console.error('Error fetching sale social proof:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
