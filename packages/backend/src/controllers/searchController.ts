/**
 * searchController.ts — Sprint 4a
 * Handles GET /api/items/search and GET /api/items/categories
 */

import { Request, Response } from 'express';
import { searchItems, getItemCategories, SearchQuery } from '../services/itemSearchService';

// ---------------------------------------------------------------------------
// GET /api/items/search
// Query params: q, category, condition, saleId, priceMin, priceMax, sort, limit, offset
// ---------------------------------------------------------------------------
export const searchItemsHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const q = (req.query.q as string | undefined)?.trim();
    const category = (req.query.category as string | undefined)?.trim() || undefined;
    const condition = (req.query.condition as string | undefined)?.trim() || undefined;
    const saleId = (req.query.saleId as string | undefined)?.trim() || undefined;

    const priceMin = req.query.priceMin !== undefined
      ? parseFloat(req.query.priceMin as string)
      : undefined;
    const priceMax = req.query.priceMax !== undefined
      ? parseFloat(req.query.priceMax as string)
      : undefined;

    const rawSort = (req.query.sort as string | undefined) || 'relevance';
    const sort: SearchQuery['sort'] =
      ['relevance', 'newest', 'price_asc', 'price_desc'].includes(rawSort)
        ? (rawSort as SearchQuery['sort'])
        : 'relevance';

    const limit = req.query.limit !== undefined
      ? parseInt(req.query.limit as string, 10)
      : 20;
    const offset = req.query.offset !== undefined
      ? parseInt(req.query.offset as string, 10)
      : 0;

    // Validate numeric params
    if (
      (priceMin !== undefined && isNaN(priceMin)) ||
      (priceMax !== undefined && isNaN(priceMax)) ||
      isNaN(limit) ||
      isNaN(offset)
    ) {
      res.status(400).json({ message: 'Invalid numeric query parameter' });
      return;
    }

    const result = await searchItems({ q, category, condition, saleId, priceMin, priceMax, sort, limit, offset });

    res.json(result);
  } catch (err) {
    console.error('GET /api/items/search error:', err);
    res.status(500).json({ message: 'Search failed. Please try again.' });
  }
};

// ---------------------------------------------------------------------------
// GET /api/items/categories
// Returns all available categories with item counts. Lightweight metadata endpoint.
// ---------------------------------------------------------------------------
export const getItemCategoriesHandler = async (_req: Request, res: Response): Promise<void> => {
  try {
    const categories = await getItemCategories();
    res.json({ categories });
  } catch (err) {
    console.error('GET /api/items/categories error:', err);
    res.status(500).json({ message: 'Failed to fetch categories.' });
  }
};
