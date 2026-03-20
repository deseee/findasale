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

    res.json(entry);
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

    const { title, subtitle, content, category, tags, references } = req.body;

    // Validation
    if (!title || !content || !category) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    if (content.length < 500) {
      return res.status(400).json({ message: 'Content must be at least 500 characters' });
    }

    if (tags && tags.length > 10) {
      return res.status(400).json({ message: 'Maximum 10 tags allowed' });
    }

    const entry = await encyclopediaService.createEntry(req.user.id, {
      title,
      subtitle,
      content,
      category,
      tags,
      references
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
    if (error.message === 'Entry with this slug already exists') {
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

    // Find entry by slug to get ID
    const entry = await encyclopediaService.getEntryBySlug(slug, req.user.id);
    if (!entry) {
      return res.status(404).json({ message: 'Entry not found' });
    }

    if (typeof helpful !== 'boolean') {
      return res.status(400).json({ message: 'helpful must be boolean' });
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
    const { title, subtitle, content, category, tags, changeNote } = req.body;

    // P1-A: Verify ownership before allowing update
    const entry = await encyclopediaService.getEntry(entryId);
    if (!entry) {
      return res.status(404).json({ message: 'Entry not found' });
    }
    if (entry.authorId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const result = await encyclopediaService.updateEntry(
      entryId,
      req.user.id,
      req.user.role,
      {
        title,
        subtitle,
        content,
        category,
        tags,
        changeNote
      }
    );

    res.json({
      revisionId: result.revisionId,
      entryId: result.id,
      changeNote: result.revisions?.[0]?.changeNote,
      createdAt: result.revisions?.[0]?.createdAt
    });
  } catch (error: any) {
    console.error('[Encyclopedia] Error updating entry:', error);
    if (error.message === 'Unauthorized') {
      return res.status(403).json({ message: error.message });
    }
    if (error.message === 'Entry not found') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to update entry' });
  }
};

/**
 * GET /api/encyclopedia/entries/:entryId/revisions
 * Get revision history for entry
 */
export const getRevisions = async (req: AuthRequest, res: Response) => {
  try {
    const { entryId } = req.params;

    const revisions = await encyclopediaService.getEntryRevisions(entryId);

    res.json({ revisions });
  } catch (error) {
    console.error('[Encyclopedia] Error fetching revisions:', error);
    res.status(500).json({ message: 'Failed to fetch revisions' });
  }
};
