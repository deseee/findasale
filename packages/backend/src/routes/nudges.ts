import express from 'express';
import { authenticate } from '../middleware/auth';
import * as nudgeController from '../controllers/nudgeController';

const router = express.Router();

// GET /api/nudges — fetch personalized nudges
router.get('/', authenticate, nudgeController.getNudges);

export default router;
