/**
 * Watermark Controller
 *
 * Handles organizer watermark removal settings:
 * - PATCH /api/organizer/settings/watermark — update removal toggle (TEAMS only)
 * - GET /api/organizer/settings/watermark — read current setting
 */

import { Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';
import { z } from 'zod';

// Inlined TEAMS check — '@findasale/shared' alias does not resolve in Railway Docker build (S574 documented).
const isTeams = (tier: string | null | undefined): boolean => tier === 'TEAMS';

// Schema for watermark update request
const watermarkUpdateSchema = z.object({
  removeWatermarkEnabled: z.boolean(),
});

/**
 * GET /api/organizer/settings/watermark
 * Authenticated endpoint: read current organizer's watermark setting
 */
export const getWatermarkSetting = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer access required.' });
    }

    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
      select: {
        id: true,
        subscriptionTier: true,
        removeWatermarkEnabled: true,
      },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    res.json({
      removeWatermarkEnabled: organizer.removeWatermarkEnabled,
      canAccess: isTeams(organizer.subscriptionTier),
      subscriptionTier: organizer.subscriptionTier,
    });
  } catch (error: any) {
    console.error('Error fetching watermark setting:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * PATCH /api/organizer/settings/watermark
 * Authenticated endpoint: update watermark removal toggle
 * TEAMS tier required
 */
export const updateWatermarkSetting = async (req: AuthRequest, res: Response) => {
  try {
    const hasOrganizerRole = req.user?.roles?.includes('ORGANIZER') || req.user?.role === 'ORGANIZER';
    if (!req.user || !hasOrganizerRole) {
      return res.status(403).json({ message: 'Organizer access required.' });
    }

    // Validate request body
    const validation = watermarkUpdateSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        message: 'Invalid request',
        errors: validation.error.errors,
      });
    }

    const { removeWatermarkEnabled } = validation.data;

    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
      select: { id: true, subscriptionTier: true },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    // Tier check: TEAMS tier required to enable watermark removal
    if (removeWatermarkEnabled && !isTeams(organizer.subscriptionTier)) {
      return res.status(403).json({
        message: 'Watermark removal requires the Teams plan.',
      });
    }

    const updated = await prisma.organizer.update({
      where: { userId: req.user.id },
      data: {
        removeWatermarkEnabled,
      },
      select: {
        id: true,
        subscriptionTier: true,
        removeWatermarkEnabled: true,
      },
    });

    res.json({
      removeWatermarkEnabled: updated.removeWatermarkEnabled,
      subscriptionTier: updated.subscriptionTier,
    });
  } catch (error: any) {
    console.error('Error updating watermark setting:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
