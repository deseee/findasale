import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import {
  DEFAULT_MARKDOWN_PRECEDENCE,
  MARKDOWN_PRECEDENCE_VALUES,
  effectiveMarkdownPrecedence,
  isMarkdownPrecedence,
  isMissingPrecedenceTableError,
} from '../services/markdownPrecedence';

/**
 * Markdown precedence (2026-11-04): which automatic markdown wins when the sale's Day-2/Day-3 markdowns and a
 * markdown cycle could both apply to one item. Owner-scoped: always the caller's own organizer profile, never an id
 * from the request. Tier rules live in routes/markdownCycles.ts (GET any tier; PUT needs PRO/TEAMS unless the
 * value is FIRST_WINS, the default, so switching back is never paywalled). See services/markdownPrecedence.ts.
 */

async function ownOrganizer(req: AuthRequest, res: Response) {
  if (!req.user) {
    res.status(401).json({ message: 'Authentication required' });
    return null;
  }
  const organizer = await prisma.organizer.findUnique({
    where: { userId: req.user.id },
    select: { id: true, subscriptionTier: true },
  });
  if (!organizer) {
    res.status(403).json({ message: 'Organizer profile not found' });
    return null;
  }
  return organizer;
}

// GET /api/markdown-cycles/precedence
export const getMarkdownPrecedence = async (req: AuthRequest, res: Response) => {
  try {
    const organizer = await ownOrganizer(req, res);
    if (!organizer) return;
    let stored: string = DEFAULT_MARKDOWN_PRECEDENCE;
    let available = true;
    try {
      const row = await prisma.organizerMarkdownPrecedence.findUnique({
        where: { organizerId: organizer.id },
        select: { precedence: true },
      });
      if (row && isMarkdownPrecedence(row.precedence)) stored = row.precedence;
    } catch (err) {
      if (!isMissingPrecedenceTableError(err)) throw err;
      available = false;
    }
    res.json({
      precedence: stored,
      effectivePrecedence: effectiveMarkdownPrecedence(stored, organizer.subscriptionTier),
      options: MARKDOWN_PRECEDENCE_VALUES,
      available,
    });
  } catch (error) {
    console.error('[markdown-precedence] get failed:', error);
    res.status(500).json({ message: 'Server error while fetching markdown precedence' });
  }
};

// PUT /api/markdown-cycles/precedence  body: { precedence: 'FIRST_WINS' | 'SALE_TIERS_WIN' | 'CYCLES_WIN' }
export const updateMarkdownPrecedence = async (req: AuthRequest, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { precedence } = body;
    if (!isMarkdownPrecedence(precedence)) {
      return res.status(400).json({
        message: `precedence must be one of ${MARKDOWN_PRECEDENCE_VALUES.join(', ')}`,
      });
    }
    const extra = Object.keys(body).filter((k) => k !== 'precedence');
    if (extra.length > 0) {
      return res.status(400).json({ message: `Unknown field(s): ${extra.join(', ')}` });
    }

    const organizer = await ownOrganizer(req, res);
    if (!organizer) return;

    try {
      await prisma.organizerMarkdownPrecedence.upsert({
        where: { organizerId: organizer.id },
        create: { organizerId: organizer.id, precedence },
        update: { precedence },
      });
    } catch (err) {
      if (isMissingPrecedenceTableError(err)) {
        return res.status(503).json({ message: 'This setting is not available yet. Please try again later.' });
      }
      throw err;
    }

    res.json({
      precedence,
      effectivePrecedence: effectiveMarkdownPrecedence(precedence, organizer.subscriptionTier),
      options: MARKDOWN_PRECEDENCE_VALUES,
      available: true,
    });
  } catch (error) {
    console.error('[markdown-precedence] update failed:', error);
    res.status(500).json({ message: 'Server error while updating markdown precedence' });
  }
};
