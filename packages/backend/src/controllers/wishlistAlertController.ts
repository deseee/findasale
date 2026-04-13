/**
 * Feature #32: Wishlist Alert Controller
 *
 * Endpoints:
 * GET  /my — List user's wishlist alerts
 * POST / — Create a new alert
 * PATCH /:id — Update alert
 * DELETE /:id — Delete alert
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import * as service from '../services/wishlistAlertService';

const router = Router();

/**
 * GET /my — List user's wishlist alerts (authenticated)
 */
router.get('/my', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const alerts = await service.getUserAlerts(userId);
    res.json(alerts);
  } catch (error: any) {
    console.error('Error fetching wishlist alerts:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * POST / — Create a new wishlist alert (authenticated)
 * Body: { name, q?, category?, minPrice?, maxPrice?, radiusMiles?, lat?, lng?, tags? }
 */
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const input = req.body;

    if (!input.name) {
      return res.status(400).json({ message: 'Alert name is required' });
    }

    const alert = await service.createAlert(userId, input);
    res.status(201).json(alert);
  } catch (error: any) {
    console.error('Error creating wishlist alert:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * PATCH /:id — Update a wishlist alert (authenticated, ownership check)
 * Body: { name?, q?, category?, minPrice?, maxPrice?, radiusMiles?, lat?, lng?, tags? }
 */
router.patch('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const input = req.body;

    const alert = await service.updateAlert(id, userId, input);
    res.json(alert);
  } catch (error: any) {
    if (error.message === 'Alert not found') {
      return res.status(404).json({ message: error.message });
    }
    console.error('Error updating wishlist alert:', error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * DELETE /:id — Delete a wishlist alert (authenticated, ownership check)
 */
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;

    await service.deleteAlert(id, userId);
    res.status(204).send();
  } catch (error: any) {
    if (error.message === 'Alert not found') {
      return res.status(404).json({ message: error.message });
    }
    console.error('Error deleting wishlist alert:', error);
    res.status(500).json({ message: error.message });
  }
});

export default router;
