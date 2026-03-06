import { Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';

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

// POST /api/saved-searches — create a new saved search
export const createSavedSearch = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { name, filters } = req.body;

    if (!name || !filters) {
      return res.status(400).json({ message: 'Name and filters are required' });
    }

    if (typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ message: 'Name must be a non-empty string' });
    }

    const savedSearch = await prisma.savedSearch.create({
      data: {
        userId: req.user.id,
        name: name.trim(),
        filters,
        notifyOnNew: false,
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
