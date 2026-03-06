import express from 'express';
import { authenticate } from '../middleware/auth';
import {
  createSlot,
  getSlots,
  bookSlot,
  cancelBooking,
  deleteSlot,
  getMyBookings,
} from '../controllers/pickupController';

const router = express.Router();

// Public routes
router.get('/slots/:saleId', getSlots);

// Protected routes (require authentication)
router.post('/slots', authenticate, createSlot);
router.delete('/slot/:slotId', authenticate, deleteSlot);

router.post('/book/:slotId', authenticate, bookSlot);
router.delete('/booking/:bookingId', authenticate, cancelBooking);

router.get('/my-bookings', authenticate, getMyBookings);

export default router;
