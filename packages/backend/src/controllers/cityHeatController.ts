import { Request, Response } from 'express';
import { getOrComputeCityHeatIndex } from '../services/cityHeatService';
import { isAdminRequest } from '../utils/adminRequest';

export const getCityHeat = async (req: Request, res: Response) => {
  try {
    // 2026-10-13 (security): ?forceRefresh=true bypasses the cache and recomputes for every caller, so on
    // this public route it is honored for admins only; anyone else gets the cached result.
    const forceRefresh = req.query.forceRefresh === 'true' && (await isAdminRequest(req, res));
    const result = await getOrComputeCityHeatIndex(forceRefresh);
    res.json(result);
  } catch (error) {
    console.error('Error fetching city heat index:', error);
    res.status(500).json({ message: 'Server error while fetching city heat index' });
  }
};
