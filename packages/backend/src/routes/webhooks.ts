import { Router } from 'express';
import { listWebhooks, createWebhook, updateWebhook, deleteWebhook } from '../controllers/webhookController';
import { authenticate } from '../middleware/auth';
import { requireTier } from '../middleware/requireTier'; // #13: Webhooks are TEAMS exclusive

const router = Router();

router.get('/', authenticate, requireTier('TEAMS'), listWebhooks);          // GET    /api/webhooks
router.post('/', authenticate, requireTier('TEAMS'), createWebhook);         // POST   /api/webhooks
router.patch('/:id', authenticate, requireTier('TEAMS'), updateWebhook);     // PATCH  /api/webhooks/:id
router.delete('/:id', authenticate, requireTier('TEAMS'), deleteWebhook);    // DELETE /api/webhooks/:id

export default router;
