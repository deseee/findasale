import { Router } from 'express';
import {
  getViewerCount,
  pingViewer,
  removeViewer,
} from '../controllers/viewerController';

const router = Router();

// GET /api/sales/:saleId/viewers — retrieve current viewer count
router.get('/:saleId/viewers', getViewerCount);

// POST /api/sales/:saleId/viewers/ping — register/refresh a viewer session
router.post('/:saleId/viewers/ping', pingViewer);

// DELETE /api/sales/:saleId/viewers/:viewerId — remove viewer on unmount
router.delete('/:saleId/viewers/:viewerId', removeViewer);

export default router;
