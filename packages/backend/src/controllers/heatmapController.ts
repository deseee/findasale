import { Request, Response } from 'express';
import { z } from 'zod';
import { getOrComputeHeatmapTiles } from '../services/heatmapService';
import { isAdminRequest } from '../utils/adminRequest';

const heatmapQuerySchema = z.object({
  lat: z.string().optional(),
  lng: z.string().optional(),
  zoom: z.string().optional(),
  days: z.string().optional().default('7'),
  forceRefresh: z.string().optional().default('false'),
});

/**
 * GET /api/sales/heatmap
 * Fetch pre-computed or on-demand heatmap density data
 */
export const getHeatmapHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const query = heatmapQuerySchema.parse(req.query);
    // 2026-10-13 (security): the service caches one result per day regardless of `days`, so an
    // unbounded window computed on a cache miss would be served to everyone for 6 hours. Clamp it.
    const parsedDays = parseInt(query.days, 10);
    const daysWindow = Number.isFinite(parsedDays) ? Math.min(Math.max(parsedDays, 1), 30) : 7;
    // ?forceRefresh=true bypasses the cache and recomputes; on this public route only an admin may use it.
    const forceRefresh = query.forceRefresh === 'true' && (await isAdminRequest(req, res));

    // NOTE (Phase 2): Validate lat/lng/zoom bounds if needed in Phase 2
    // For now, return global heatmap (all cells)

    const response = await getOrComputeHeatmapTiles(daysWindow, forceRefresh);

    res.status(200).json(response);
  } catch (error: any) {
    console.error('Error fetching heatmap:', error);
    res.status(400).json({ message: error.message || 'Invalid heatmap query' });
  }
};
