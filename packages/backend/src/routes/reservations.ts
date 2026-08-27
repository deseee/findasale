import express from 'express';
import { authenticate } from '../middleware/auth';
import { shopperReservationsLimiter } from '../middleware/rateLimiter'; // rate-limit hardening Item 1
import {
  placeHold,
  cancelHold,
  getItemReservation,
  getOrganizerHolds,
  getOrganizerHoldCount,
  batchUpdateHolds,
  updateHold,
  getHoldSettings,
  updateHoldSettings,
  checkinAtSale,
  markSoldAndCreateInvoice,
  getInvoiceDetails,
  getMyInvoices,
  getMyHoldsFull,
  getItemInvoiceStatus,
  releaseInvoice,
  releaseInvoiceById,
} from '../controllers/reservationController';

const router = express.Router();

// Public routes (no auth required)
// Deliberately anonymous: a logged-out shopper viewing a sale page must see the hold
// countdown on a RESERVED item. The handler's select is narrowed to { itemId, status,
// expiresAt } — no holder identity, no reservation id. Do not add routes here casually.
router.get('/item/:itemId', getItemReservation);               // unauthenticated: hold expiry for HoldTimer

// All other reservation routes require auth
router.use(authenticate);

// Moved behind `authenticate` 2026-08-17 (was mounted above this line, fully anonymous).
// It answers "does item X have a live invoice, and when does that payment window close?"
// for any item id, and item ids are public on every sale page — so anonymously it let a
// caller map exactly which items on a sale have money in flight and when each payment
// window lapses. That is reconnaissance, not shopper-facing information: it has ZERO
// frontend callers (re-verified 2026-08-17 — `grep -rn "invoice-status|invoiceExists|
// invoiceStatus"` across packages/frontend and packages/mcp-server returns no hits
// outside the backend itself), and the availability a logged-out shopper actually needs
// comes from Item.status === 'RESERVED' via getItemById, not from here. Kept rather than
// deleted so no unknown consumer breaks; it is now simply authenticated.
// NOTE ON ORDERING: this is a 3-segment path, so it cannot be shadowed by the 1-segment
// (/my-invoices) or 2-segment (/:id/invoice) routes registered below.
router.get('/invoice-status/item/:itemId', getItemInvoiceStatus); // auth required: check if item has invoice

// Shopper holds and invoice routes
// rate-limit hardening Item 1 (2026-08-27): dedicated 40/min-per-user budget on both --
// same handler, one limiter instance -- after a ~17min external 429-storm against these
// two routes that the global/auth limiters contained but had no dedicated budget for.
router.get('/my-holds-full', shopperReservationsLimiter, getMyHoldsFull);  // Shopper: full holds detail for CartDrawer
router.get('/shopper', shopperReservationsLimiter, getMyHoldsFull);        // Shopper: full holds detail (My Holds page)
router.get('/my-invoices', getMyInvoices);                     // Shopper: list their pending invoices

// Invoice detail route (auth required: shopper or organizer)
router.get('/:invoiceIdOrReservationId/invoice', getInvoiceDetails); // Get invoice details

// Organizer-specific routes (more specific routes BEFORE less specific — critical for Express routing)
router.get('/organizer/settings', getHoldSettings);            // Feature #121: get hold settings
router.patch('/organizer/settings', updateHoldSettings);       // Feature #121: update hold settings
router.get('/organizer/count', getOrganizerHoldCount);         // #24: lightweight count for dashboard badge
router.get('/organizer', getOrganizerHolds);                   // #24: organizer holds with filters
router.post('/batch', batchUpdateHolds);                       // #24: batch release/extend/markSold

// Hold-to-Pay Phase 2: Invoice endpoints
router.post('/:id/mark-sold', markSoldAndCreateInvoice);       // Organizer: mark sold + create invoice
router.post('/:id/release-invoice', releaseInvoice);           // Organizer: cancel pending invoice
// Reservation-less POS-cart invoices (posController.createCombinedInvoice with zero held
// reservations) have no ItemReservation for the route above to key off of -- this cancels
// by the HoldInvoice's own id instead. 3-segment literal-prefixed path, so it cannot be
// shadowed by any `/:id/...` route registered above or below it.
router.post('/invoice/:invoiceId/release', releaseInvoiceById); // Shopper or organizer: cancel a reservation-less POS-cart invoice

// Check-in endpoint (Feature #121)
router.post('/checkin', checkinAtSale);                        // Feature #121: shopper check-in at sale
router.post('/', placeHold);                                   // shopper: place a hold (Feature #121 enhanced)
router.delete('/:id', cancelHold);                             // shopper/organizer: cancel a hold
router.patch('/:id', updateHold);                              // organizer: confirm or cancel

export default router;
