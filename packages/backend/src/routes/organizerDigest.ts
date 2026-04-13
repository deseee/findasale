// Manual trigger endpoint for organizer weekly digest
// Admin-only — for testing and manual dispatch

import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { sendOrganizerWeeklyDigest } from '../services/organizerAnalyticsService';

const router = express.Router();

/**
 * POST /api/organizer-digest/trigger
 * Admin-only endpoint to manually trigger the weekly organizer digest job
 */
router.post('/trigger', authenticate, async (req: AuthRequest, res: express.Response) => {
  try {
    // Verify user is admin
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    console.log(`[OrganizerDigest] Manual trigger initiated by admin ${req.user.id}`);

    // Send digest job
    await sendOrganizerWeeklyDigest();

    res.json({
      message: 'Organizer weekly digest job triggered successfully',
      timestamp: new Date(),
    });
  } catch (err) {
    console.error('[OrganizerDigest] Manual trigger failed:', err);
    res.status(500).json({
      message: 'Failed to trigger organizer digest job',
      error: (err as Error).message,
    });
  }
});

export default router;
