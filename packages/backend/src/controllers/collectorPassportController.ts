/**
 * Feature #45: Collector Passport Controller
 *
 * Endpoints for managing user's collector identity (passport), viewing public profiles,
 * and discovering matching items.
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import {
  getOrCreatePassport,
  updatePassport,
  getPublicPassport,
  getMatchingItems,
} from '../services/collectorPassportService';

// Validation schemas
const updatePassportSchema = z.object({
  bio: z.string().max(500).optional().nullable(),
  specialties: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  notifyEmail: z.boolean().optional(),
  notifyPush: z.boolean().optional(),
  isPublic: z.boolean().optional(),
});

/**
 * GET /my
 * Get authenticated user's collector passport (create if not exists)
 */
export const getMyPassport = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const passport = await getOrCreatePassport(req.user.id);
    res.json(passport);
  } catch (error) {
    console.error('[collectorPassport] getMyPassport error:', error);
    res.status(500).json({ message: 'Server error while fetching passport' });
  }
};

/**
 * PATCH /my
 * Update authenticated user's collector passport
 */
export const updateMyPassport = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Validate input
    const parsed = updatePassportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: 'Validation error',
        errors: parsed.error.errors,
      });
    }

    const passport = await updatePassport(req.user.id, parsed.data);
    res.json(passport);
  } catch (error) {
    console.error('[collectorPassport] updateMyPassport error:', error);
    res.status(500).json({ message: 'Server error while updating passport' });
  }
};

/**
 * GET /users/:userId
 * Get public collector profile
 * Returns 404 if passport doesn't exist or is not public
 */
export const getPublicPassport = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    const passport = await getPublicPassport(userId);

    if (!passport) {
      return res.status(404).json({ message: 'Collector profile not found or is private' });
    }

    res.json(passport);
  } catch (error) {
    console.error('[collectorPassport] getPublicPassport error:', error);
    res.status(500).json({ message: 'Server error while fetching profile' });
  }
};

/**
 * GET /matches
 * Get items from recent sales (30 days) that match authenticated user's passport
 */
export const getMyMatches = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Get user's passport
    const passport = await getOrCreatePassport(req.user.id);

    // Get matching items
    const matchedItems = await getMatchingItems(passport.id);

    res.json({
      totalMatches: matchedItems.length,
      items: matchedItems,
    });
  } catch (error) {
    console.error('[collectorPassport] getMyMatches error:', error);
    res.status(500).json({ message: 'Server error while fetching matches' });
  }
};
