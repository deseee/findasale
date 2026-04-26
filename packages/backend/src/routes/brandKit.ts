/**
 * Brand Kit Routes
 * Handles organizer brand customization endpoints
 */

import { Router, Request, Response } from 'express';
import { authenticate, optionalAuthenticate } from '../middleware/auth';
import { requireTier } from '../middleware/requireTier';
import { getBrandKit, getBrandKitBySlug, updateBrandKit } from '../controllers/brandKitController';
import {
  generateBusinessCards,
  generateLetterhead,
  generateSocialHeaders,
  generateBrandedYardSign,
} from '../controllers/brandKitPrintController';

const router = Router();

// Authenticated: GET /api/brand-kit/organizers/me
// Fetch current organizer's brand kit (authenticated)
router.get('/organizers/me', authenticate, (req: Request, res: Response) => {
  if (!req.user?.organizerId) {
    return res.status(403).json({ message: 'Not an organizer' });
  }
  return getBrandKit({ ...req, params: { id: req.user.organizerId } } as any, res);
});

// Public: GET /api/brand-kit/organizers/:id
// Fetch brand kit by organizer ID (publicly accessible)
router.get('/organizers/:id', (req: Request, res: Response) => getBrandKit(req as any, res));

// Public: GET /api/brand-kit/by-slug/:slug
// Fetch brand kit by custom storefront slug (publicly accessible)
router.get('/by-slug/:slug', (req: Request, res: Response) => getBrandKitBySlug(req as any, res));

// Authenticated: PATCH /api/brand-kit
// Update current organizer's brand kit (PRO tier for advanced fields)
router.patch('/', authenticate, requireTier('PRO'), updateBrandKit);

// Authenticated: Feature #241 - Brand Kit Print Assets (PRO tier only)
// Generate downloadable brand asset PDFs
// Note: Uses optionalAuthenticate instead of authenticate because these routes are accessed via <a href> links
// from the browser, which don't include Authorization headers by default. Handlers verify authentication and tier internally.
router.get('/organizer/business-card', optionalAuthenticate, generateBusinessCards);
router.get('/organizer/letterhead', optionalAuthenticate, generateLetterhead);
router.get('/organizer/social-headers', optionalAuthenticate, generateSocialHeaders);
router.get('/organizer/yard-sign', optionalAuthenticate, generateBrandedYardSign);

export default router;
