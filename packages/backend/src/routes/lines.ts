import { Router } from 'express';
import {
  startLine,
  callNext,
  getLineStatus,
  markAsEntered,
  broadcastPositionUpdates,
  joinLine,
  getMyPosition,
  leaveLine,
} from '../controllers/lineController';
import { authenticate } from '../middleware/auth';

const router = Router();

// ── Organizer routes ──────────────────────────────────────────────────────────
router.post('/:saleId/start', authenticate, startLine);
router.post('/:saleId/next', authenticate, callNext);
router.get('/:saleId/status', authenticate, getLineStatus);
router.post('/:saleId/broadcast', authenticate, broadcastPositionUpdates);
router.post('/entry/:lineEntryId/entered', authenticate, markAsEntered);

// ── Shopper routes ────────────────────────────────────────────────────────────
router.post('/:saleId/join', authenticate, joinLine);
router.get('/:saleId/my-position', authenticate, getMyPosition);
router.delete('/:saleId/leave', authenticate, leaveLine);

export default router;
