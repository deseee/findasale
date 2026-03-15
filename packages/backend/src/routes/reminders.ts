import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  getReminderForSale,
  createReminder,
  deleteReminder,
} from '../controllers/reminderController';

const router = Router();

// Get reminder status for a specific sale
router.get('/sale/:saleId', authenticateToken, getReminderForSale);

// Create a new reminder
router.post('/', authenticateToken, createReminder);

// Delete a reminder
router.delete('/:reminderId', authenticateToken, deleteReminder);

export default router;
