import express from 'express';
import { authenticate } from '../middleware/auth';
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
  getItemInvoiceStatus,
  releaseInvoice,
} from '../controllers/reservationController';

const router = express.Router();

// Public routes (no auth required)
router.get('/item/:itemId', getItemReservation);               // unauthenticated: hold expiry for HoldTimer
router.get('/invoice-status/item/:itemId', getItemInvoiceStatus); // unauthenticated: check if item has invoice

// All other reservation routes require auth
router.use(authenticate);

// Shopper invoice routes
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

// Check-in endpoint (Feature #121)
router.post('/checkin', checkinAtSale);                        // Feature #121: shopper check-in at sale
router.post('/', placeHold);                                   // shopper: place a hold (Feature #121 enhanced)
router.delete('/:id', cancelHold);                             // shopper/organizer: cancel a hold
router.patch('/:id', updateHold);                              // organizer: confirm or cancel

export default router;
