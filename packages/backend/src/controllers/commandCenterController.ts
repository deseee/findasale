import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { getCommandCenterSummary } from '../services/commandCenterService';

export const getCommandCenter = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id || !req.user?.organizer?.id) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const organizerId = req.user.organizer.id;

    // Extract filters from query params
    const { status, dateFrom, dateTo } = req.query;

    const filters = {
      status: (status as string)?.toLowerCase() || undefined,
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
