import express from 'express';
import { getLatencyStatus } from '../controllers/healthController';

const router = express.Router();

/**
 * Feature #20: Proactive Degradation Mode
 * Health and latency endpoints for monitoring server performance
 */

// GET /api/health/latency — returns current latency + degradation status
router.get('/latency', getLatencyStatus);

export default router;
