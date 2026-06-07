import express from 'express';
import { getLatencyStatus } from '../controllers/healthController';

const router = express.Router();

/**
 * Feature #20: Proactive Degradation Mode
 * Health and latency endpoints for monitoring server performance
 */

// GET /api/health — simple liveness check for uptime monitors (no auth required)
router.get('/', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// GET /api/health/latency — returns current latency + degradation status
router.get('/latency', getLatencyStatus);

export default router;
