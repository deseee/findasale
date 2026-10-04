import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  addToInventory,
  removeFromInventory,
  pullFromInventory,
  getInventoryItems,
  getPriceHistory,
  getPricingSuggestion,
  InventoryFilters,
} from '../services/itemInventoryService';
import { prisma } from '../lib/prisma';
import { resolveItemOwnerOrganizer } from '../utils/itemOwner';

/**
 * Ownership gate for the handlers that take :itemId from the URL and hand it straight to a service that does
 * not check the caller (remove, price-history, pricing-advice). Loads the item with what
 * resolveItemOwnerOrganizer needs (organizerId, saleId and the sale's organizer) and returns true only when
 * the caller owns it. A missing item and someone else's item both return false, so the caller answers the
 * same 404 for both and never reveals that an item exists. A database error propagates to the handler's catch.
 */
async function callerOwnsItem(itemId: string, userId: string | undefined): Promise<boolean> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      organizerId: true,
      saleId: true,
      sale: {
        select: {
          organizer: { select: { id: true, userId: true, subscriptionTier: true, lat: true, lng: true } },
        },
      },
    },
  });
  if (!item) return false;
  return (await resolveItemOwnerOrganizer(item, userId)) !== null;
}

/**
 * POST /api/item-inventory/add
 * Add an item to the organizer's inventory.
 * Body: { itemId: string }
 */
export const addItemToInventory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user?.organizerProfile?.id) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const { itemId } = req.body;
    if (!itemId) {
      res.status(400).json({ message: 'itemId is required' });
      return;
    }

    const item = await addToInventory(itemId, req.user.organizerProfile.id);
    res.json({ item });
  } catch (error: any) {
    console.error('Error adding item to inventory:', error);
    res.status(error.message.includes('not found') ? 404 : 400).json({ message: error.message });
  }
};

/**
 * DELETE /api/item-inventory/:itemId
 * Remove an item from the organizer's inventory.
 */
export const removeItemFromInventory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user?.organizerProfile?.id) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const { itemId } = req.params;
    if (!itemId) {
      res.status(400).json({ message: 'itemId is required' });
      return;
    }

    // Same 404 body for a missing item and for someone else's item (no existence leak).
    if (!(await callerOwnsItem(itemId, req.user.id))) {
      res.status(404).json({ message: 'Item not found' });
      return;
    }

    const item = await removeFromInventory(itemId);
    res.json({ item });
  } catch (error: any) {
    console.error('Error removing item from inventory:', error);
    res.status(400).json({ message: error.message });
  }
};

/**
 * POST /api/item-inventory/:itemId/pull
 * Pull an item from inventory into a sale.
 * Body: { saleId: string, priceOverride?: number }
 */
export const pullItemFromInventory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user?.organizerProfile?.id) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const { itemId } = req.params;
    const { saleId, priceOverride } = req.body;

    if (!itemId || !saleId) {
      res.status(400).json({ message: 'itemId and saleId are required' });
      return;
    }

    const newItem = await pullFromInventory(itemId, saleId, req.user.organizerProfile.id, priceOverride);
    res.json({ item: newItem });
  } catch (error: any) {
    console.error('Error pulling item from inventory:', error);
    res.status(error.message.includes('Unauthorized') ? 403 : 400).json({ message: error.message });
  }
};

/**
 * GET /api/item-inventory
 * List all inventory items for the authenticated organizer.
 * Query params: search, category, condition, minPrice, maxPrice, status
 */
export const listInventoryItems = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user?.organizerProfile?.id) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const filters: InventoryFilters = {
      search: req.query.search as string | undefined,
      category: req.query.category as string | undefined,
      condition: req.query.condition as string | undefined,
      minPrice: req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined,
      maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined,
      status: req.query.status as string | undefined,
    };

    const items = await getInventoryItems(req.user.organizerProfile.id, filters);
    res.json({ items, total: items.length });
  } catch (error: any) {
    console.error('Error listing inventory items:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * GET /api/item-inventory/:itemId/price-history
 * Get price history for an inventory item.
 */
export const getItemPriceHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user?.organizerProfile?.id) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const { itemId } = req.params;
    if (!itemId) {
      res.status(400).json({ message: 'itemId is required' });
      return;
    }

    // Ownership first: the service reads by itemId alone. 404 (same body as a missing item) when not the owner.
    if (!(await callerOwnsItem(itemId, req.user.id))) {
      res.status(404).json({ message: 'Item not found' });
      return;
    }

    const history = await getPriceHistory(itemId);
    res.json({ history });
  } catch (error: any) {
    console.error('Error getting price history:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * GET /api/item-inventory/:itemId/pricing-advice
 * Get pricing suggestion for an inventory item.
 * Query param: saleId (required)
 */
export const getItemPricingAdvice = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user?.organizerProfile?.id) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const { itemId } = req.params;
    const { saleId } = req.query;

    if (!itemId || !saleId) {
      res.status(400).json({ message: 'itemId and saleId are required' });
      return;
    }

    // Ownership first: the service reads by itemId alone. 404 (same body as a missing item) when not the owner.
    if (!(await callerOwnsItem(itemId, req.user.id))) {
      res.status(404).json({ message: 'Item not found' });
      return;
    }

    const suggestion = await getPricingSuggestion(itemId, saleId as string);
    res.json({ suggestion });
  } catch (error: any) {
    console.error('Error getting pricing advice:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({ message: error.message });
  }
};
