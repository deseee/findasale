import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../index';
import { getCommandCenterSummary } from '../services/commandCenterService';
import type { CommandCenterFilters } from '../types/commandCenter';

export const getCommandCenter = async (req: AuthRequest, res: Response) => {
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

    const organizerId = organizer.id;

    const { status, dateFrom, dateTo } = req.query;

    const filters: CommandCenterFilters = {
      status: (status as CommandCenterFilters['status']) || undefined,
      dateFrom: (dateFrom as string) || undefined,
      dateTo: (dateTo as string) || undefined,
    };

    const result = await getCommandCenterSummary(organizerId, filters);
    res.json(result);
  } catch (error) {
    console.error('Command Center error:', error);
    res
      .status(500)
      .json({ success: false, error: 'Failed to fetch command center' });
  }
};
