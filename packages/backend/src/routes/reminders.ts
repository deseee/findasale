import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getReminderForSale,
  createReminder,
  deleteReminder,
} from '../controllers/reminderController';

const router = Router();

// Get reminder status for a specific sale
router.get('/sale/:saleId', authenticate, getReminderForSale);

// Create a new reminder
router.post('/', authenticate, createReminder);

// Delete a reminder
router.delete('/:reminderId', authenticate, deleteReminder);

export default router;
