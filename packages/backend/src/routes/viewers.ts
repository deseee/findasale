import { Router } from 'express';
import {
  getViewerCount,
  pingViewer,
  removeViewer,
} from '../controllers/viewerController';
import { optionalAuthenticate } from '../middleware/auth';

const router = Router();

// GET /api/viewers/:saleId — retrieve current viewer count
router.get('/:saleId', getViewerCount);

// POST /api/viewers/:saleId/ping — register/refresh a viewer session
router.post('/:saleId/ping', pingViewer);

// DELETE /api/viewers/:saleId/:viewerId — remove viewer on unmount
// optionalAuthenticate: attaches req.user if a valid token is present so the
// controller can scope deletion to the authenticated user; unauthenticated
// requests are still accepted (viewer records are ephemeral session data).
router.delete('/:saleId/:viewerId', optionalAuthenticate, removeViewer);

export default router;
