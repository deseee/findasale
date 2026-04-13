import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { getItemSocialProof, getSaleSocialProof } from '../services/socialProofService';

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
