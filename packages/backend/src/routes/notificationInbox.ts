import express from 'express';
import { authenticate } from '../middleware/auth';
import { getNotifications, markRead, markAllRead, deleteNotification } from '../controllers/notificationInboxController';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get all notifications for the user
router.get('/', getNotifications);

// Mark all notifications as read
router.patch('/read-all', markAllRead);

// Mark a single notification as read
router.patch('/:id/read', markRead);

// Delete a single notification
router.delete('/:id', deleteNotification);

export default router;
