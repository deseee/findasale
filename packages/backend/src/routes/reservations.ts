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
} from '../controllers/reservationController';

const router = express.Router();

// All reservation routes require auth
router.use(authenticate);

// Specific routes before param routes to prevent collision
router.get('/organizer', getOrganizerHolds);           // #24: organizer holds with filters
router.get('/organizer/count', getOrganizerHoldCount); // #24: lightweight count for dashboard badge
router.post('/batch', batchUpdateHolds);               // #24: batch release/extend/markSold
router.get('/item/:itemId', getItemReservation);       // any auth'd user: hold on a specific item
router.post('/', placeHold);                           // shopper: place a hold
router.delete('/:id', cancelHold);                     // shopper/organizer: cancel a hold
router.patch('/:id', updateHold);                      // organizer: confirm or cancel

export default router;
