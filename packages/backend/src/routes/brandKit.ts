/**
 * Brand Kit Routes
 * Handles organizer brand customization endpoints
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { getBrandKit, getBrandKitBySlug, updateBrandKit } from '../controllers/brandKitController';

const router = Router();

// Public: GET /api/brand-kit/organizers/:id
// Fetch brand kit by organizer ID (publicly accessible)
router.get('/organizers/:id', (req: Request, res: Response) => getBrandKit(req as any, res));

// Public: GET /api/brand-kit/by-slug/:slug
// Fetch brand kit by custom storefront slug (publicly accessible)
router.get('/by-slug/:slug', (req: Request, res: Response) => getBrandKitBySlug(req as any, res));

// Authenticated: PATCH /api/brand-kit
// Update current organizer's brand kit (PRO tier for advanced fields)
router.patch('/', authenticate, updateBrandKit);

export default router;
