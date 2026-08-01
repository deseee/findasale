import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireOrganizerOrTeamMember } from '../utils/posAuth'; // S1183 Fix 1: replaces requireOrganizer -- also recognizes an authenticated TEAM_MEMBER with register access
import { paymentLimiter } from '../middleware/rateLimiter';
import {
  shareCart,
  getLinkedCarts,
  getPosContext,
  pullCart,
  createPaymentLink,
  getPaymentLink,
  sendPaymentLinkEmail,
  getActiveHolds,
  sendHoldInvoice,
  requestCartShare,
  deleteSession,
  searchShopperHolds,
  pullHoldsToCart,
  createCombinedInvoice,
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
  confirmPaymentRequest,
} from '../controllers/posPaymentController';

const router = Router();

// Shopper shares cart
router.post('/sessions', authenticate, shareCart);

// POS context (S1183 Fix 1): sales/venmo/zelle for the resolved organizer -- narrow,
// POS-scoped, read-only. Gated by the handler itself (resolveOrganizerOrTeamMember),
// not by requireOrganizerOrTeamMember middleware -- see posController.getPosContext.
router.get('/context', authenticate, getPosContext);

// Organizer endpoints
router.get('/sessions', authenticate, getLinkedCarts);
router.post('/sessions/:sessionId/pull', authenticate, pullCart);
router.delete('/sessions/:sessionId', authenticate, requireOrganizerOrTeamMember, deleteSession);
router.post('/payment-links', authenticate, createPaymentLink);
router.post('/payment-links/email', authenticate, requireOrganizerOrTeamMember, sendPaymentLinkEmail);
router.get('/payment-links/:linkId', authenticate, getPaymentLink);
router.get('/holds', authenticate, getActiveHolds);
router.post('/holds/:reservationId/invoice', authenticate, sendHoldInvoice);
router.post('/holds/:reservationId/request-cart', authenticate, requireOrganizerOrTeamMember, requestCartShare);

// POS Cart + Invoice endpoints (multi-source holds)
router.get('/sessions/:sessionId/shopper-holds', authenticate, searchShopperHolds);
router.post('/sessions/:sessionId/pull-holds', authenticate, pullHoldsToCart);
router.post('/sessions/:sessionId/create-invoice', authenticate, createCombinedInvoice);

// POS Payment Request endpoints
router.post('/payment-request', authenticate, requireOrganizerOrTeamMember, paymentLimiter, createPaymentRequest);
// Transaction summary — organizer only
router.get('/transactions/today-summary', authenticate, requireOrganizerOrTeamMember, getTodaySummary);
// 'active' and 'pending' must be registered before '/:requestId' to avoid param collision
router.get('/payment-requests/active', authenticate, requireOrganizerOrTeamMember, getOrganizerActiveRequests);
router.get('/payment-request/pending', authenticate, getPendingPaymentRequests);
// Parameterized routes — must come last
router.get('/payment-request/:requestId', authenticate, getPaymentRequest);
router.post('/payment-request/:requestId/accept', authenticate, acceptPaymentRequest);
router.post('/payment-request/:requestId/decline', authenticate, declinePaymentRequest);
router.post('/payment-request/:requestId/confirm', authenticate, confirmPaymentRequest);
router.post('/payment-request/:id/cancel', authenticate, requireOrganizerOrTeamMember, cancelPaymentRequest);

export default router;
