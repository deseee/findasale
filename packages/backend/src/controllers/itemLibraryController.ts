import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  addToLibrary,
  removeFromLibrary,
  pullFromLibrary,
  getLibraryItems,
  getPriceHistory,
  getPricingSuggestion,
  LibraryFilters,
} from '../services/itemLibraryService';

/**
 * POST /api/item-library/add
 * Add an item to the organizer's library.
 * Body: { itemId: string }
 */
export const addItemToLibrary = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const item = await addToLibrary(itemId, req.user.organizerProfile.id);
    res.json({ item });
  } catch (error: any) {
    console.error('Error adding item to library:', error);
    res.status(error.message.includes('not found') ? 404 : 400).json({ message: error.message });
  }
};

/**
 * DELETE /api/item-library/:itemId
 * Remove an item from the organizer's library.
 */
export const removeItemFromLibrary = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const item = await removeFromLibrary(itemId);
    res.json({ item });
  } catch (error: any) {
    console.error('Error removing item from library:', error);
    res.status(400).json({ message: error.message });
  }
};

/**
 * POST /api/item-library/:itemId/pull
 * Pull an item from library into a sale.
 * Body: { saleId: string, priceOverride?: number }
 */
export const pullItemFromLibrary = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const newItem = await pullFromLibrary(itemId, saleId, req.user.organizerProfile.id, priceOverride);
    res.json({ item: newItem });
  } catch (error: any) {
    console.error('Error pulling item from library:', error);
    res.status(error.message.includes('Unauthorized') ? 403 : 400).json({ message: error.message });
  }
};

/**
 * GET /api/item-library
 * List all library items for the authenticated organizer.
 * Query params: search, category, condition, minPrice, maxPrice, status
 */
export const listLibraryItems = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user?.organizerProfile?.id) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    const filters: LibraryFilters = {
      search: req.query.search as string | undefined,
      category: req.query.category as string | undefined,
      condition: req.query.condition as string | undefined,
      minPrice: req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined,
      maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined,
      status: req.query.status as string | undefined,
    };

    const items = await getLibraryItems(req.user.organizerProfile.id, filters);
    res.json({ items, total: items.length });
  } catch (error: any) {
    console.error('Error listing library items:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * GET /api/item-library/:itemId/price-history
 * Get price history for a library item.
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

    const history = await getPriceHistory(itemId);
    res.json({ history });
  } catch (error: any) {
    console.error('Error getting price history:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * GET /api/item-library/:itemId/pricing-advice
 * Get pricing suggestion for a library item.
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

    const suggestion = await getPricingSuggestion(itemId, saleId as string);
    res.json({ suggestion });
  } catch (error: any) {
    console.error('Error getting pricing advice:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({ message: error.message });
  }
};
