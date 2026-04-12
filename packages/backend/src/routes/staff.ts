import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireTier } from '../middleware/requireTier';
import {
  listStaff,
  getStaff,
  updateStaffProfile,
  getStaffAvailability,
  updateStaffAvailability,
  checkCoverageGaps,
  getStaffPerformance
} from '../controllers/staffController';

const router = Router();

/**
 * Staff management routes — TEAMS tier only
 * Mounted at /api/workspaces/:workspaceId/staff
 */

// All routes require TEAMS tier
router.use(authenticate, requireTier('TEAMS'));

/**
 * GET /api/workspaces/:workspaceId/staff
 * List all staff members in workspace
 */
router.get('/:workspaceId/staff', listStaff);

/**
 * GET /api/workspaces/:workspaceId/staff/:staffId
 * Get single staff member detail
 */
router.get('/:workspaceId/staff/:staffId', getStaff);

/**
 * PATCH /api/workspaces/:workspaceId/staff/:staffId
 * Update staff profile
 */
router.patch('/:workspaceId/staff/:staffId', updateStaffProfile);

/**
 * GET /api/workspaces/:workspaceId/staff/:staffId/availability
 * Get availability for date range
 */
router.get('/:workspaceId/staff/:staffId/availability', getStaffAvailability);

/**
 * PATCH /api/workspaces/:workspaceId/staff/:staffId/availability
 * Update staff availability
 */
router.patch('/:workspaceId/staff/:staffId/availability', updateStaffAvailability);

/**
 * GET /api/workspaces/:workspaceId/coverage-gaps
 * Check coverage gaps for workspace
 */
router.get('/:workspaceId/coverage-gaps', checkCoverageGaps);

/**
 * GET /api/workspaces/:workspaceId/staff/:staffId/performance
 * Get performance snapshot
 */
router.get('/:workspaceId/staff/:staffId/performance', getStaffPerformance);

export default router;
