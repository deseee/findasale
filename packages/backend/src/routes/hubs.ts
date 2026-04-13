import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireTier } from '../middleware/requireTier';
import {
  discoverHubs,
  getHub,
  createHub,
  updateHub,
  deleteHub,
  listMyHubs,
  joinHub,
  leaveHub,
  setHubEvent,
} from '../controllers/hubController';

const router = Router();

// Public endpoints
router.get('/api/hubs', discoverHubs);
router.get('/api/hubs/:slug', getHub);

// Authenticated endpoints (organizer)
router.get('/api/organizer/hubs', authenticate, listMyHubs);
router.post('/api/organizer/hubs', authenticate, requireTier('PRO'), createHub);
router.put('/api/organizer/hubs/:hubId', authenticate, requireTier('PRO'), updateHub);
router.delete('/api/organizer/hubs/:hubId', authenticate, requireTier('PRO'), deleteHub);
router.post('/api/organizer/hubs/:hubId/join', authenticate, requireTier('PRO'), joinHub);
router.delete('/api/organizer/hubs/:hubId/sales/:saleId', authenticate, requireTier('PRO'), leaveHub);
router.patch('/api/organizer/hubs/:hubId/event', authenticate, requireTier('PRO'), setHubEvent);

export default router;
