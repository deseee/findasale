import { Request, Response } from 'express';
import { getOrComputeCityHeatIndex } from '../services/cityHeatService';

export const getCityHeat = async (req: Request, res: Response) => {
  try {
    const forceRefresh = req.query.forceRefresh === 'true';
    const result = await getOrComputeCityHeatIndex(forceRefresh);
    res.json(result);
  } catch (error) {
    console.error('Error fetching city heat index:', error);
    res.status(500).json({ message: 'Server error while fetching city heat index' });
  }
};
