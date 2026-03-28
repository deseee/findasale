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
} from '../controllers/reservationController';

const router = express.Router();

// All reservation routes require auth
router.use(authenticate);

// Organizer-specific routes (before generic :id routes)
router.get('/organizer/settings', getHoldSettings);            // Feature #121: get hold settings
router.patch('/organizer/settings', updateHoldSettings);       // Feature #121: update hold settings
router.get('/organizer', getOrganizerHolds);                   // #24: organizer holds with filters
router.get('/organizer/count', getOrganizerHoldCount);         // #24: lightweight count for dashboard badge
router.post('/batch', batchUpdateHolds);                       // #24: batch release/extend/markSold

// Check-in endpoint (Feature #121)
router.post('/checkin', checkinAtSale);                        // Feature #121: shopper check-in at sale

// Generic reservation routes
router.get('/item/:itemId', getItemReservation);               // any auth'd user: hold on a specific item
router.post('/', placeHold);                                   // shopper: place a hold (Feature #121 enhanced)
router.delete('/:id', cancelHold);                             // shopper/organizer: cancel a hold
router.patch('/:id', updateHold);                              // organizer: confirm or cancel

export default router;
