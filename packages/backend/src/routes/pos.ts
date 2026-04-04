import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  shareCart,
  getLinkedCarts,
  pullCart,
  createPaymentLink,
  getPaymentLink,
  getActiveHolds,
  sendHoldInvoice,
} from '../controllers/posController';

const router = Router();

// Shopper shares cart
router.post('/sessions', authenticate, shareCart);

// Organizer endpoints
router.get('/sessions', authenticate, getLinkedCarts);
router.post('/sessions/:sessionId/pull', authenticate, pullCart);
router.post('/payment-links', authenticate, createPaymentLink);
router.get('/payment-links/:linkId', authenticate, getPaymentLink);
router.get('/holds', authenticate, getActiveHolds);
router.post('/holds/:reservationId/invoice', authenticate, sendHoldInvoice);

export default router;
