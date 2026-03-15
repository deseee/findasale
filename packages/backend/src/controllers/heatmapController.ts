import { Request, Response } from 'express';
import { z } from 'zod';
import { getOrComputeHeatmapTiles } from '../services/heatmapService';

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
    const daysWindow = parseInt(query.days);
    const forceRefresh = query.forceRefresh === 'true';

    // TODO: Validate lat/lng/zoom bounds if needed in Phase 2
    // For now, return global heatmap (all cells)

    const response = await getOrComputeHeatmapTiles(daysWindow, forceRefresh);

    res.status(200).json(response);
  } catch (error: any) {
    console.error('Error fetching heatmap:', error);
    res.status(400).json({ error: error.message || 'Invalid heatmap query' });
  }
};
