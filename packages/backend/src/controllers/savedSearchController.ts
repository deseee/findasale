import { Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';
import { PUBLIC_ITEM_FILTER } from '../helpers/itemQueries'; // Feature #595: match same public-item visibility rules as /api/search

export interface SearchFilters {
  q: string;
  category?: string;
  radius?: number;
  lat?: number;
  lng?: number;
  priceMin?: number;
  priceMax?: number;
  condition?: string;
  saleStatus?: string;
  dateFrom?: string;
  dateTo?: string;
}

// Feature #595 follow-up: hard cap on saved searches per user. checkNewMatches loops over every
// notifyOnNew=true search and runs a live Item.findMany for each on every extension poll (every 25
// min per user) — an unbounded count per user is a real cost/abuse vector. 25 is generous for a
// real shopper, bounded for abuse.
const MAX_SAVED_SEARCHES_PER_USER = 25;

// POST /api/saved-searches — create a new saved search
export const createSavedSearch = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { name, filters, notifyOnNew } = req.body;

    if (!name || !filters) {
      return res.status(400).json({ message: 'Name and filters are required' });
    }

    if (typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ message: 'Name must be a non-empty string' });
    }

    const existingCount = await prisma.savedSearch.count({
      where: { userId: req.user.id },
    });

    if (existingCount >= MAX_SAVED_SEARCHES_PER_USER) {
      return res.status(400).json({
        message: `You've reached the maximum of ${MAX_SAVED_SEARCHES_PER_USER} saved searches. Delete one to save a new one.`,
      });
    }

    const savedSearch = await prisma.savedSearch.create({
      data: {
        userId: req.user.id,
        name: name.trim(),
        filters,
        notifyOnNew: typeof notifyOnNew === 'boolean' ? notifyOnNew : false,
      },
    });

    res.status(201).json({ message: 'Search saved successfully', savedSearch });
  } catch (error) {
    console.error('Create saved search error:', error);
    res.status(500).json({ message: 'Server error while creating saved search' });
  }
};

// GET /api/saved-searches — list all saved searches for the user
export const getUserSavedSearches = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const savedSearches = await prisma.savedSearch.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      savedSearches,
      total: savedSearches.length,
    });
  } catch (error) {
    console.error('Get saved searches error:', error);
    res.status(500).json({ message: 'Server error while fetching saved searches' });
  }
};

// DELETE /api/saved-searches/:id — delete a saved search
export const deleteSavedSearch = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { id } = req.params;

    // Verify ownership
    const savedSearch = await prisma.savedSearch.findUnique({
      where: { id },
    });

    if (!savedSearch) {
      return res.status(404).json({ message: 'Saved search not found' });
    }

    if (savedSearch.userId !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    await prisma.savedSearch.delete({
      where: { id },
    });

    res.json({ message: 'Saved search deleted successfully' });
  } catch (error) {
    console.error('Delete saved search error:', error);
    res.status(500).json({ message: 'Server error while deleting saved search' });
  }
};

// PATCH /api/saved-searches/:id — update notifyOnNew toggle
export const updateSavedSearch = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { id } = req.params;
    const { notifyOnNew, name } = req.body;

    // Verify ownership
    const savedSearch = await prisma.savedSearch.findUnique({
      where: { id },
    });

    if (!savedSearch) {
      return res.status(404).json({ message: 'Saved search not found' });
    }

    if (savedSearch.userId !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const updated = await prisma.savedSearch.update({
      where: { id },
      data: {
        ...(typeof notifyOnNew === 'boolean' && { notifyOnNew }),
        ...(name && typeof name === 'string' && { name: name.trim() }),
      },
    });

    res.json({ message: 'Saved search updated successfully', savedSearch: updated });
  } catch (error) {
    console.error('Update saved search error:', error);
    res.status(500).json({ message: 'Server error while updating saved search' });
  }
};

// GET /api/saved-searches/check-new — poll for items matching notify-enabled saved searches
// Feature #595: Saved-Search Desktop Deal Alerts. Called periodically by the browser extension's
// background alarm (extension/background.js) so it can fire a chrome.notifications desktop alert.
// Only searches with notifyOnNew=true are checked. "New" means Item.createdAt is after the
// search's lastNotifiedAt cursor — or the search's own createdAt on the very first check, so a
// freshly-saved search doesn't immediately dump its entire historical backlog as "new". The cursor
// advances to now() on every check regardless of whether a match was found, so re-polling never
// re-scans the same window twice. Filter mapping mirrors GET /api/search's itemWhere construction
// (packages/backend/src/routes/search.ts) so an alert only ever matches what that saved search
// would actually return if re-run.
export const checkNewMatches = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const searches = await prisma.savedSearch.findMany({
      where: { userId: req.user.id, notifyOnNew: true },
    });

    const now = new Date();
    const results: Array<{
      savedSearchId: string;
      name: string;
      count: number;
      items: Array<{ id: string; title: string; price: number | null; saleId: string | null; saleTitle: string | null; city: string | null; state: string | null }>;
    }> = [];

    for (const search of searches) {
      const filters: any = (search.filters as any) || {};
      const since = search.lastNotifiedAt || search.createdAt;

      // Mirror /api/search's saleStatus mapping (active|upcoming|all) so an alert only fires for
      // sales the saved search would actually surface if re-run on the /search page.
      let saleStatusWhere: any = {};
      if (filters.saleStatus === 'active') {
        saleStatusWhere = { startDate: { lte: now }, OR: [{ isOngoing: true }, { endDate: { gte: now } }] };
      } else if (filters.saleStatus === 'upcoming') {
        saleStatusWhere = { startDate: { gt: now } };
      }

      const itemWhere: any = {
        createdAt: { gt: since },
        status: 'AVAILABLE',
        sale: { status: 'PUBLISHED', ...saleStatusWhere },
        ...PUBLIC_ITEM_FILTER,
      };

      const q = typeof filters.q === 'string' ? filters.q.trim() : '';
      if (q) {
        itemWhere.OR = [
          { title: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ];
      }
      if (filters.category) {
        itemWhere.category = { equals: String(filters.category), mode: 'insensitive' };
      }
      if (filters.condition) {
        itemWhere.condition = { equals: String(filters.condition), mode: 'insensitive' };
      }
      if (filters.priceMin != null && filters.priceMin !== '') {
        itemWhere.price = { ...(itemWhere.price || {}), gte: Number(filters.priceMin) };
      }
      if (filters.priceMax != null && filters.priceMax !== '') {
        itemWhere.price = { ...(itemWhere.price || {}), lte: Number(filters.priceMax) };
      }

      let matches = await prisma.item.findMany({
        where: itemWhere,
        select: {
          id: true,
          title: true,
          price: true,
          saleId: true,
          sale: { select: { id: true, title: true, city: true, state: true, lat: true, lng: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      // Optional radius filter (Haversine) — same formula as wishlistAlertService.ts
      if (filters.lat != null && filters.lng != null && filters.radius != null) {
        const lat1 = Number(filters.lat);
        const lng1 = Number(filters.lng);
        const radiusMiles = Number(filters.radius);
        const R = 3959;
        matches = matches.filter((item) => {
          const s = item.sale;
          if (!s || s.lat == null || s.lng == null) return false;
          const dLat = ((s.lat - lat1) * Math.PI) / 180;
          const dLng = ((s.lng - lng1) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos((lat1 * Math.PI) / 180) * Math.cos((s.lat * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          return R * c <= radiusMiles;
        });
      }

      if (matches.length > 0) {
        results.push({
          savedSearchId: search.id,
          name: search.name,
          count: matches.length,
          items: matches.slice(0, 5).map((item) => ({
            id: item.id,
            title: item.title,
            price: item.price != null ? Number(item.price) : null,
            saleId: item.saleId,
            saleTitle: item.sale?.title || null,
            city: item.sale?.city || null,
            state: item.sale?.state || null,
          })),
        });
      }

      // Advance the cursor regardless of match outcome — see comment above.
      await prisma.savedSearch.update({
        where: { id: search.id },
        data: { lastNotifiedAt: now },
      }).catch(() => {});
    }

    res.json({ matches: results });
  } catch (error) {
    console.error('Check new matches error:', error);
    res.status(500).json({ message: 'Server error while checking for new matches' });
  }
};

