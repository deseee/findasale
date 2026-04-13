import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../index';
import { getOrganizerActivityFeed } from '../services/organizerActivityFeedService';
import type { OrganizerActivityFeedResponse } from '../types/activityFeed';

export const getActivityFeed = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
      select: { id: true },
    });

    if (!organizer) {
      return res.status(404).json({ success: false, error: 'Organizer profile not found' });
    }

    // Parse optional saleIds filter
    const saleIdsParam = req.query.saleIds as string | undefined;
    const saleIds = saleIdsParam ? saleIdsParam.split(',').filter(Boolean) : undefined;

    const activities = await getOrganizerActivityFeed(organizer.id, saleIds, 20);

    const response: OrganizerActivityFeedResponse = {
      success: true,
      activities,
    };

    res.json(response);
  } catch (error) {
    console.error('Organizer activity feed error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch activity feed' });
  }
};
