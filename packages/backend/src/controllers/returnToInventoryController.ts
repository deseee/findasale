import { Response } from 'express';
import { returnItemsToInventory } from '../services/itemInventoryService';
import { AuthRequest } from '../middleware/auth';

/**
 * POST /api/sales/:saleId/return-items
 * Feature #300: Return unsold items from an ENDED sale back to inventory.
 * Body: { itemIds?: string[] } — if empty, returns all eligible items.
 * Returns: { returned: number, skipped: Array<{ id, title, reason }> }
 */
export const returnItemsToInventoryHandler = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params as { saleId: string };
    const { itemIds = [] } = req.body as { itemIds: string[] };
    const organizerId = req.user?.id;

    if (!organizerId) {
      return res.status(401).json({ error: 'Organizer not authenticated' });
    }

    const result = await returnItemsToInventory(saleId, itemIds, organizerId);
    return res.json(result);
  } catch (err: any) {
    if (err.message === 'Unauthorized') return res.status(403).json({ error: err.message });
    if (err.message?.includes('must be ENDED')) return res.status(400).json({ error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
};
