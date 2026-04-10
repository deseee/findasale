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
import { requireTier } from '../middleware/requireTier';

const router = Router();

// ── Organizer routes ──────────────────────────────────────────────────────────
// Line Queue is a SIMPLE+ tier feature
router.post('/:saleId/start', authenticate, requireTier('SIMPLE'), startLine);
router.post('/:saleId/next', authenticate, requireTier('SIMPLE'), callNext);
router.get('/:saleId/status', authenticate, requireTier('SIMPLE'), getLineStatus);
// T4: /notify — "now serving #N" SMS blast to all waiting shoppers
router.post('/:saleId/notify', authenticate, requireTier('SIMPLE'), broadcastPositionUpdates);
router.post('/:saleId/broadcast', authenticate, requireTier('SIMPLE'), broadcastPositionUpdates); // compat alias
router.post('/entry/:lineEntryId/entered', authenticate, requireTier('SIMPLE'), markAsEntered);

// ── Shopper routes ────────────────────────────────────────────────────────────
router.post('/:saleId/join', authenticate, joinLine);
router.get('/:saleId/my-position', authenticate, getMyPosition);
router.delete('/:saleId/leave', authenticate, leaveLine);

export default router;
