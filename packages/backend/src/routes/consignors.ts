import { Router } from 'express';
import {
  listConsignors,
  createConsignor,
  getConsignor,
  updateConsignor,
  deleteConsignor,
  runPayout,
  getConsignorPortal,
  acceptConsignorAgreement,
  archiveConsignor,
  unarchiveConsignor,
  resendConsignorInvite,
} from '../controllers/consignorController';
import {
  getPortalSquare,
  startPortalSquare,
  completePortalSquare,
  refreshPortalSquare,
  disconnectPortalSquare,
  requestPortalDataRemovalHandler,
} from '../controllers/consignorPortalSquareController';
import { authenticate } from '../middleware/auth';
import {
  consignorInviteResendLimiter,
  consignorPortalDataRemovalLimiter,
  consignorPortalSquareLimiter,
  consignorWriteLimiter,
} from '../middleware/rateLimiter';

const router = Router();

// Public endpoints — NO authentication required
// Must be defined BEFORE the :id routes to avoid Express router conflicts
router.get('/portal/:token', getConsignorPortal);

// Consignor accepts the in-app agreement rendered on their portal (Patrick, 2026-09-25)
router.post('/portal/:token/agreement/accept', acceptConsignorAgreement);

// Consignor connects Square for payouts from their portal, no FindA.Sale account (2026-10-06).
// Capability-token gated, rate limited, first connect only. See consignorPortalSquareController.ts.
router.get('/portal/:token/square', consignorPortalSquareLimiter, getPortalSquare);
router.post('/portal/:token/square/start', consignorPortalSquareLimiter, startPortalSquare);
router.post('/portal/:token/square/callback', consignorPortalSquareLimiter, completePortalSquare);
router.post('/portal/:token/square/refresh', consignorPortalSquareLimiter, refreshPortalSquare);
// Self-serve disconnect (revokes at Square, clears locally, keeps all records) and a data-removal
// REQUEST (emails the organizer, deletes nothing). Both capability-token gated; the request is also
// capped at 3 per day per token.
router.post('/portal/:token/square/disconnect', consignorPortalSquareLimiter, disconnectPortalSquare);
router.post(
  '/portal/:token/data-removal-request',
  consignorPortalSquareLimiter,
  consignorPortalDataRemovalLimiter,
  requestPortalDataRemovalHandler
);

// All routes below require authentication
router.use(authenticate);

// List consignors for the organizer's workspace
router.get('/', listConsignors);

// Create a new consignor
router.post('/', consignorWriteLimiter, createConsignor);

// Get consignor details (items + payouts)
router.get('/:id', getConsignor);

// Update consignor information
router.put('/:id', consignorWriteLimiter, updateConsignor);

// Delete consignor (blocks if payouts exist)
router.delete('/:id', deleteConsignor);

// Archive / unarchive (soft delete that keeps the money trail)
router.post('/:id/archive', archiveConsignor);
router.post('/:id/unarchive', unarchiveConsignor);

// Resend the welcome invite (portal link + Square payout setup), 2026-10-06
router.post('/:id/send-invite', consignorInviteResendLimiter, resendConsignorInvite);

// Run a payout for this consignor
router.post('/:id/payout', runPayout);

export default router;
