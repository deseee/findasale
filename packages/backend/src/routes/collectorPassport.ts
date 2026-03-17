/**
 * Feature #45: Collector Passport Routes
 */

import express from 'express';
import { authenticate } from '../middleware/auth';
import {
  getMyPassport,
  updateMyPassport,
  getPublicPassport,
  getMyMatches,
} from '../controllers/collectorPassportController';

const router = express.Router();

// Authenticated routes
router.get('/my', authenticate, getMyPassport);
router.patch('/my', authenticate, updateMyPassport);
router.get('/matches', authenticate, getMyMatches);

// Public routes
router.get('/users/:userId', getPublicPassport);

export default router;
