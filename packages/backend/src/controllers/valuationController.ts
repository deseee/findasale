import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { generateValuation, getValuation } from '../services/valuationService';

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
      include: { sale: { include: { organizer: true } } },
    });

    if (!item) {
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
      include: { sale: true },
    });

    if (!item) {
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
