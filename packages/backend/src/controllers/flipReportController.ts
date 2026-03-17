import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { getFlipReport } from '../services/flipReportService';

/**
 * GET /api/flip-report/:saleId
 * Retrieve Flip Report for a completed sale
 * Requires: auth (organizer), PRO tier
 * Returns: FlipReport object
 */
export const getFlipReportHandler = async (req: AuthRequest, res: Response) => {
  try {
    const { saleId } = req.params;

    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const organizerId = req.user.id;

    // Get the flip report
    const flipReport = await getFlipReport(saleId, organizerId);

    return res.status(200).json(flipReport);
  } catch (error: any) {
    if (error.message === 'Sale not found') {
      return res.status(404).json({ message: 'Sale not found' });
    }

    if (error.message === 'Unauthorized: you do not own this sale') {
      return res.status(403).json({ message: 'You do not have permission to view this report' });
    }

    console.error('Error fetching flip report:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
