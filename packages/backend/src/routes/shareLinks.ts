import { Router } from 'express';
import { authenticate, optionalAuthenticate } from '../middleware/auth';
import {
  generateShareLink,
  getShareLink,
  recordShareClick,
} from '../controllers/shareLinksController';

const router = Router();

// Organizer endpoints (require authentication)
router.post('/sales/:saleId/share-link', authenticate, generateShareLink);
router.get('/sales/:saleId/share-link', authenticate, getShareLink);

// Public endpoint (no auth required, but reads auth if present)
router.get('/share/:code', optionalAuthenticate, recordShareClick);

export default router;
