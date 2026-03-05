import { Router } from 'express';
import { listWebhooks, createWebhook, updateWebhook, deleteWebhook } from '../controllers/webhookController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, listWebhooks);          // GET    /api/webhooks
router.post('/', authenticate, createWebhook);         // POST   /api/webhooks
router.patch('/:id', authenticate, updateWebhook);     // PATCH  /api/webhooks/:id
router.delete('/:id', authenticate, deleteWebhook);    // DELETE /api/webhooks/:id

export default router;
