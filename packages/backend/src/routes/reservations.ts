import express from 'express';
import { authenticate } from '../middleware/auth';
import {
  placeHold,
  cancelHold,
  getItemReservation,
  getOrganizerHolds,
  updateHold,
} from '../controllers/reservationController';

const router = express.Router();

// All reservation routes require auth
router.use(authenticate);

// Specific routes before param routes to prevent collision
router.get('/organizer', getOrganizerHolds);      // organizer: all active holds
router.get('/item/:itemId', getItemReservation);  // any auth'd user: hold on a specific item
router.post('/', placeHold);                      // shopper: place a hold
router.delete('/:id', cancelHold);                // shopper/organizer: cancel a hold
router.patch('/:id', updateHold);                 // organizer: confirm or cancel

export default router;
