import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireOrganizer } from '../middleware/auth';
import {
  shareCart,
  getLinkedCarts,
  pullCart,
  createPaymentLink,
  getPaymentLink,
  getActiveHolds,
  sendHoldInvoice,
} from '../controllers/posController';
import {
  createPaymentRequest,
  getPaymentRequest,
  acceptPaymentRequest,
  declinePaymentRequest,
  getPendingPaymentRequests,
  getOrganizerActiveRequests,
  getTodaySummary,
  cancelPaymentRequest,
} from '../controllers/posPaymentController';

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

// POS Payment Request endpoints
router.post('/payment-request', authenticate, requireOrganizer, createPaymentRequest);
// Transaction summary — organizer only
router.get('/transactions/today-summary', authenticate, requireOrganizer, getTodaySummary);
// 'active' and 'pending' must be registered before '/:requestId' to avoid param collision
router.get('/payment-requests/active', authenticate, requireOrganizer, getOrganizerActiveRequests);
router.get('/payment-request/pending', authenticate, getPendingPaymentRequests);
// Parameterized routes — must come last
router.get('/payment-request/:requestId', authenticate, getPaymentRequest);
router.post('/payment-request/:requestId/accept', authenticate, acceptPaymentRequest);
router.post('/payment-request/:requestId/decline', authenticate, declinePaymentRequest);
router.post('/payment-request/:id/cancel', authenticate, requireOrganizer, cancelPaymentRequest);

export default router;
