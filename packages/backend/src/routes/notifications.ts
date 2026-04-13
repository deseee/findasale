import express from 'express';
import { authenticate } from '../middleware/auth';
import {
  subscribeToSale,
  unsubscribeFromSale,
  getUserSubscriptions,
  sendSMSUpdate
} from '../controllers/notificationController';

const router = express.Router();

// Subscription management
router.post('/subscribe', authenticate, subscribeToSale);
router.delete('/unsubscribe/:saleId', authenticate, unsubscribeFromSale);
router.get('/subscriptions', authenticate, getUserSubscriptions);

// SMS updates
router.post('/send-sms', authenticate, sendSMSUpdate);

export default router;
