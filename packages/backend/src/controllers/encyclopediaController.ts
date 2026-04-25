import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as encyclopediaService from '../services/encyclopediaService';

/**
 * GET /api/encyclopedia/entries
 * List entries with search/filter/sort
 */
export const listEntries = async (req: AuthRequest, res: Response) => {
  try {
    const { page, limit, category, search, sort } = req.query;

    const result = await encyclopediaService.listEntries(
      {
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 20,
        category: category as string,
        search: search as string,
        sort: (sort as 'recent' | 'popular' | 'trending') || 'recent'
      },
      req.user?.id
    );

    res.json(result);
  } catch (error) {
    console.error('[Encyclopedia] Error listing entries:', error);
    res.status(500).json({ message: 'Failed to list entries' });
  }
};

/**
 * GET /api/encyclopedia/entries/:slug
 * Get single entry by slug with related entries
 */
export const getEntryBySlug = async (req: AuthRequest, res: Response) => {
  try {
    const { slug } = req.params;

    const entry = await encyclopediaService.getEntryBySlug(slug, req.user?.id);

    if (!entry) {
      return res.status(404).json({ message: 'Entry not found' });
    }

    res.json({ entry });
  } catch (error) {
    console.error('[Encyclopedia] Error fetching entry:', error);
    res.status(500).json({ message: 'Failed to fetch entry' });
  }
};

/**
 * POST /api/encyclopedia/entries
 * Create new entry (authenticated users, status=PENDING_REVIEW)
 */
export const createEntry = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { slug, title, content, category, tags } = req.body;

    if (!slug || !title || !content || !category) {
      return res.status(400).json({ message: 'slug, title, content, and category are required' });
    }

    const entry = await encyclopediaService.createEntry(req.user.id, {
      slug,
      title,
      content,
      category,
      tags: tags || [],
    });

    res.status(201).json({
      id: entry.id,
      slug: entry.slug,
      status: entry.status,
      createdAt: entry.createdAt,
      message: 'Thank you! Your entry will be reviewed by our team.'
    });
  } catch (error: any) {
    console.error('[Encyclopedia] Error creating entry:', error);
    if (error.message?.includes('already exists')) {
      return res.status(409).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to create entry' });
  }
};

/**
 * POST /api/encyclopedia/entries/:slug/vote
 * Vote on entry (helpful/not helpful)
 */
export const voteOnEntry = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { slug } = req.params;
    const { helpful } = req.body;

    if (typeof helpful !== 'boolean') {
      return res.status(400).json({ message: 'helpful must be a boolean' });
    }

    // Find entry by slug to get ID
    const entry = await encyclopediaService.getEntryBySlug(slug, req.user.id);
    if (!entry) {
      return res.status(404).json({ message: 'Entry not found' });
    }

    const result = await encyclopediaService.voteOnEntry(entry.id, req.user.id, helpful);

    res.json(result);
  } catch (error) {
    console.error('[Encyclopedia] Error voting on entry:', error);
    res.status(500).json({ message: 'Failed to vote on entry' });
  }
};

/**
 * POST /api/encyclopedia/entries/:entryId/revisions
 * Update entry and create revision (owner or admin)
 */
export const updateEntry = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { entryId } = req.params;
    const { title, content, category, tags, changeNote } = req.body;

    // Verify ownership or admin role
    const entry = await encyclopediaService.getEntry(entryId);
    if (!entry) {
      return res.status(404).json({ message: 'Entry not found' });
    }
    if (entry.authorId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Not authorized to edit this entry' });
    }

    const result = await encyclopediaService.updateEntry(entryId, {
      title,
      content,
      category,
      tags,
    });

    res.json({
      success: true,
      entryId: result.id,
      updatedAt: result.updatedAt,
      changeNote,
    });
  } catch (error: any) {
    console.error('[Encyclopedia] Error updating entry:', error);
    if (error.message?.includes('not found')) {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to update entry' });
  }
};

/**
 * GET /api/encyclopedia/entries/:entryId/revisions
 * Get revision history for entry
 */
export const getEntryRevisions = async (req: AuthRequest, res: Response) => {
  try {
    const { entryId } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

    const revisions = await encyclopediaService.getEntryRevisions(entryId, limit);

    res.json({ revisions });
  } catch (error) {
    console.error('[Encyclopedia] Error fetching revisions:', error);
    res.status(500).json({ message: 'Failed to fetch revisions' });
  }
};

/**
 * GET /api/encyclopedia/match
 * Match encyclopedia entry to an item being edited
 * Used by item editor to show relevant guides
 */
export const matchEntry = async (req: AuthRequest, res: Response) => {
  try {
    const { title, category, tags } = req.query;
    const tagList = tags ? (tags as string).split(',').filter(Boolean) : [];

    const match = await encyclopediaService.matchEntry(
      title as string,
      category as string,
      tagList
    );

    res.json(match || { entry: null, benchmarks: [] });
  } catch (error) {
    console.error('[Encyclopedia] Error matching entry:', error);
    res.status(500).json({ message: 'Failed to match entry' });
  }
};
