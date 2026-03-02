import { Router } from 'express';
import { 
  startLine,
  callNext,
  getLineStatus,
  markAsEntered
} from '../controllers/lineController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Organizer routes
router.post('/:saleId/start', authenticate, startLine);
router.post('/:saleId/next', authenticate, callNext);
router.get('/:saleId/status', authenticate, getLineStatus);
router.post('/entry/:lineEntryId/served', authenticate, markAsEntered);

export default router;
