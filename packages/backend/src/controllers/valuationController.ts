import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { generateValuation, getValuation } from '../services/valuationService';
import { isItemEmbargoedForViewer } from '../lib/saleLocationPrivacy';
import { resolveItemOwnerOrganizer } from '../utils/itemOwner';

const VALUATION_OWNER_ORGANIZER_SELECT = { id: true, userId: true, subscriptionTier: true, lat: true, lng: true } as const;

/**
 * 2026-10-13 early-access embargo: an item still inside its early-access window is hidden from everyone except
 * its owner and admin, so its valuation is too (same 404 as a missing item, existence is not revealed).
 */
async function hiddenByEmbargo(item: any, user: AuthRequest['user']): Promise<boolean> {
  if (!isItemEmbargoedForViewer(item, user)) return false;
  if (user?.role === 'ADMIN') return false;
  return (await resolveItemOwnerOrganizer(item, user?.id)) === null;
}

/**
 * GET /api/items/:itemId/valuation
 * Get valuation for an item (PRO gated)
 */
export const getItemValuation = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { itemId } = req.params;

    // Verify item exists and belongs to an organizer that the user can access
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: { sale: { include: { organizer: { select: VALUATION_OWNER_ORGANIZER_SELECT } } } },
    });

    if (!item || (await hiddenByEmbargo(item, req.user))) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Get valuation
    const result = await getValuation(itemId);

    if (result.status === 'INSUFFICIENT_DATA') {
      return res.status(200).json({
        status: 'INSUFFICIENT_DATA',
        message: `Need 10+ comparable sales to generate valuation. Found ${result.comparableCount}.`,
      });
    }

    res.json({
      status: 'READY',
      data: result.data,
    });
  } catch (error) {
    console.error('[Valuation] Error getting valuation:', error);
    res.status(500).json({ message: 'Failed to get valuation' });
  }
};

/**
 * POST /api/items/:itemId/valuation/generate
 * Trigger generation of valuation for an item (PRO gated)
 */
export const generateItemValuation = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { itemId } = req.params;

    // Verify item exists
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: { sale: { include: { organizer: { select: VALUATION_OWNER_ORGANIZER_SELECT } } } },
    });

    if (!item || (await hiddenByEmbargo(item, req.user))) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // Generate fresh valuation
    const result = await generateValuation(itemId);

    if ('insufficient_data' in result && result.insufficient_data) {
      return res.status(200).json({
        status: 'INSUFFICIENT_DATA',
        message: `Need 10+ comparable sales to generate valuation. Found ${result.comparableCount}.`,
      });
    }

    res.status(201).json({
      status: 'GENERATED',
      data: result,
    });
  } catch (error) {
    console.error('[Valuation] Error generating valuation:', error);
    res.status(500).json({ message: 'Failed to generate valuation' });
  }
};
