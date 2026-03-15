import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { getPerformanceMetrics, PerformanceMetrics } from '../services/performanceService';

/**
 * GET /api/organizer/performance
 * Query params: saleId (required), range (optional: 7d|30d|90d|custom, default: 30d),
 *               from & to (required if range=custom, ISO8601)
 * Returns comprehensive performance metrics for a sale
 */
export const getPerformanceMetricsHandler = async (req: AuthRequest, res: Response) => {
  try {
    // Auth gate
    if (!req.user) {
      return res.status(401).json({ error: 'unauthorized', message: 'Authentication required' });
    }

    if (req.user.role !== 'ORGANIZER') {
      return res.status(403).json({ error: 'forbidden', message: 'Organizer access required' });
    }

    // Get organizer ID from user
    const { prisma } = await import('../index');
    const organizer = await prisma.organizer.findUnique({
      where: { userId: req.user.id },
    });

    if (!organizer) {
      return res.status(403).json({ error: 'forbidden', message: 'Organizer profile not found' });
    }

    // Parse query params
    const { saleId, range, from, to } = req.query as {
      saleId?: string;
      range?: string;
      from?: string;
      to?: string;
    };

    // Validate saleId
    if (!saleId || typeof saleId !== 'string' || !saleId.trim()) {
      return res.status(400).json({ error: 'bad_request', message: 'saleId is required' });
    }

    // Validate date range if custom
    const effectiveRange = range || '30d';
    if (effectiveRange === 'custom' && (!from || !to)) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'from and to are required when range=custom (ISO8601 format)',
      });
    }

    // Fetch metrics
    let metrics: PerformanceMetrics;
    try {
      metrics = await getPerformanceMetrics(organizer.id, saleId, effectiveRange, from, to);
    } catch (error: any) {
      if (error.message.includes('Sale not found')) {
        return res.status(404).json({ error: 'not_found', message: 'Sale not found' });
      }
      if (error.message.includes('does not own')) {
        return res.status(403).json({ error: 'forbidden', message: 'You do not have access to this sale' });
      }
      throw error;
    }

    res.status(200).json(metrics);
  } catch (error) {
    console.error('Error fetching performance metrics:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to compute performance metrics' });
  }
};
