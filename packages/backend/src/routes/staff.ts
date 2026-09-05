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
 * Staff management routes.
 * Mounted at /api/workspaces/:workspaceId/staff
 *
 * FIX 2026-09-05 (P1, live-QA'd): reads and writes are gated separately.
 * A blanket `router.use(authenticate, requireTier('TEAMS'))` previously ran
 * before every route, which 401'd any non-organizer caller (`req.user.organizerProfile`
 * missing) — including a plain invited staff member (WorkspaceMember+TeamMember,
 * linked via userId, no Organizer row) trying to view their OWN team's roster.
 * The controller's `resolveWorkspaceForRead()` already correctly scopes reads to
 * the workspace owner OR any accepted WorkspaceMember (organizerId or userId match)
 * with no tier requirement — this router just has to stop blocking it beforehand.
 * Writes keep the TEAMS-tier gate (staff management is a TEAMS-paywalled feature);
 * `resolveWorkspaceForWrite` separately enforces owner-only regardless.
 */

// Applied per-route below — reads: authenticate only. Writes: authenticate + requireTier('TEAMS').

/**
 * GET /api/workspaces/:workspaceId/staff
 * List all staff members in workspace
 */
router.get('/:workspaceId/staff', authenticate, listStaff);

/**
 * GET /api/workspaces/:workspaceId/staff/:staffId
 * Get single staff member detail
 */
router.get('/:workspaceId/staff/:staffId', authenticate, getStaff);

/**
 * PATCH /api/workspaces/:workspaceId/staff/:staffId
 * Update staff profile
 */
router.patch('/:workspaceId/staff/:staffId', authenticate, requireTier('TEAMS'), updateStaffProfile);

/**
 * GET /api/workspaces/:workspaceId/staff/:staffId/availability
 * Get availability for date range
 */
router.get('/:workspaceId/staff/:staffId/availability', authenticate, getStaffAvailability);

/**
 * PATCH /api/workspaces/:workspaceId/staff/:staffId/availability
 * Update staff availability
 */
router.patch('/:workspaceId/staff/:staffId/availability', authenticate, requireTier('TEAMS'), updateStaffAvailability);

/**
 * GET /api/workspaces/:workspaceId/coverage-gaps
 * Check coverage gaps for workspace
 */
router.get('/:workspaceId/coverage-gaps', authenticate, checkCoverageGaps);

/**
 * GET /api/workspaces/:workspaceId/staff/:staffId/performance
 * Get performance snapshot
 */
router.get('/:workspaceId/staff/:staffId/performance', authenticate, getStaffPerformance);

/**
 * DELETE /api/workspaces/:workspaceId/staff/:staffId
 * Remove a staff member from workspace
 */
router.delete('/:workspaceId/staff/:staffId', authenticate, requireTier('TEAMS'), deleteStaff);

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
router.get('/:workspaceId/register-access', authenticate, getRegisterAccess);
router.post('/:workspaceId/register-access/:workspaceMemberId', authenticate, requireTier('TEAMS'), giveRegisterAccess);
router.delete('/:workspaceId/register-access/:workspaceMemberId', authenticate, requireTier('TEAMS'), takeRegisterAccess);

export default router;
