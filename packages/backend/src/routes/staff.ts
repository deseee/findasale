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
  getStaffPerformance,
  deleteStaff,
  getRegisterAccess,
  giveRegisterAccess,
  takeRegisterAccess
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

/**
 * DELETE /api/workspaces/:workspaceId/staff/:staffId
 * Remove a staff member from workspace
 */
router.delete('/:workspaceId/staff/:staffId', deleteStaff);

/**
 * Register access (2026-07-28)
 *
 * Creates and deletes the TeamMember row that requireBoothAuth.ts:153-168 looks
 * for. Read is open to the owner or any accepted member; both writes are owner
 * only (guards live in staffController.ts).
 *
 * Declared after the /staff routes above so the '/staff' literal keeps priority;
 * 'register-access' is a distinct literal segment and cannot collide with
 * '/:workspaceId/staff/:staffId'.
 */
router.get('/:workspaceId/register-access', getRegisterAccess);
router.post('/:workspaceId/register-access/:workspaceMemberId', giveRegisterAccess);
router.delete('/:workspaceId/register-access/:workspaceMemberId', takeRegisterAccess);

export default router;
