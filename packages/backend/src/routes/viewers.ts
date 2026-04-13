import { Router } from 'express';
import {
  getViewerCount,
  pingViewer,
  removeViewer,
} from '../controllers/viewerController';

const router = Router();

// GET /api/viewers/:saleId — retrieve current viewer count
router.get('/:saleId', getViewerCount);

// POST /api/viewers/:saleId/ping — register/refresh a viewer session
router.post('/:saleId/ping', pingViewer);

// DELETE /api/viewers/:saleId/:viewerId — remove viewer on unmount
router.delete('/:saleId/:viewerId', removeViewer);

export default router;
