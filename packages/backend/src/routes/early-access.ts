import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getStatus,
  activate,
  getItems,
} from '../controllers/earlyAccessController';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get active windows and cooldowns
router.get('/status', getStatus);

// Activate early access (spend 100 XP)
router.post('/activate', activate);

// Get items matching active windows
router.get('/items', getItems);

export default router;
