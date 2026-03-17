import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { getCommandCenterSummary } from '../services/commandCenterService';
import type { CommandCenterFilters } from '../types/commandCenter';

export const getCommandCenter = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id || !req.user?.organizer?.id) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const organizerId = req.user.organizer.id;

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
