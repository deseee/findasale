import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as Sentry from '@sentry/node';
import { prisma } from '../lib/prisma';
import {
  getStaffMembers,
  getStaffMember,
  createOrUpdateStaffProfile,
  updateAvailability,
  getAvailabilityForDateRange,
  getCoverageGaps,
  getPerformanceSnapshot,
  verifyStaffBelongsToWorkspace,
  removeStaffMember,
  listRegisterAccess,
  grantRegisterAccess,
  revokeRegisterAccess
} from '../services/staffService';

/**
 * GET /api/workspaces/:workspaceId/staff
 * List all staff members with performance data
 */
export const listStaff = async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;

    if (!workspaceId || typeof workspaceId !== 'string') {
      return res.status(400).json({ message: 'Workspace ID is required' });
    }

    const staff = await getStaffMembers(workspaceId);

    return res.json(staff);
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error listing staff:', error);
    return res.status(500).json({ message: 'Failed to list staff members' });
  }
};

/**
 * GET /api/workspaces/:workspaceId/staff/:staffId
 * Get single staff member detail
 */
export const getStaff = async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId, staffId } = req.params;

    if (!workspaceId || !staffId) {
      return res.status(400).json({ message: 'Workspace ID and Staff ID are required' });
    }

    // Verify staff belongs to workspace
    const belongs = await verifyStaffBelongsToWorkspace(staffId, workspaceId);
    if (!belongs) {
      return res.status(403).json({ message: 'Staff member not found in this workspace' });
    }

    const staff = await getStaffMember(staffId);

    return res.json(staff);
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error fetching staff:', error);
    return res.status(500).json({ message: 'Failed to fetch staff member' });
  }
};

/**
 * PATCH /api/workspaces/:workspaceId/staff/:staffId
 * Update staff profile (role, department, phone)
 */
export const updateStaffProfile = async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId, staffId } = req.params;
    const { role, department, primaryPhone } = req.body;

    if (!workspaceId || !staffId) {
      return res.status(400).json({ message: 'Workspace ID and Staff ID are required' });
    }

    // Verify staff belongs to workspace
    const belongs = await verifyStaffBelongsToWorkspace(staffId, workspaceId);
    if (!belongs) {
      return res.status(403).json({ message: 'Staff member not found in this workspace' });
    }

    // Get the staff member to get its workspaceMemberId
    const staff = await getStaffMember(staffId);

    // Update the profile
    const updated = await createOrUpdateStaffProfile(staff.workspaceMemberId, {
      role,
      department,
      primaryPhone
    });

    return res.json(updated);
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error updating staff profile:', error);
    return res.status(500).json({ message: 'Failed to update staff profile' });
  }
};

/**
 * GET /api/workspaces/:workspaceId/staff/:staffId/availability
 * Get availability for date range (query params: from, to)
 */
export const getStaffAvailability = async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId, staffId } = req.params;
    const { from, to } = req.query;

    if (!workspaceId || !staffId) {
      return res.status(400).json({ message: 'Workspace ID and Staff ID are required' });
    }

    // Verify staff belongs to workspace
    const belongs = await verifyStaffBelongsToWorkspace(staffId, workspaceId);
    if (!belongs) {
      return res.status(403).json({ message: 'Staff member not found in this workspace' });
    }

    // Parse dates with defaults
    const fromDate = from ? new Date(from as string) : new Date();
    const toDate = to ? new Date(to as string) : new Date(fromDate.getTime() + 7 * 24 * 60 * 60 * 1000); // +7 days

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return res.status(400).json({ message: 'Invalid date range' });
    }

    const availability = await getAvailabilityForDateRange(staffId, fromDate, toDate);

    return res.json(availability || { staffId, dateRange: { from: fromDate, to: toDate }, schedule: null });
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error fetching staff availability:', error);
    return res.status(500).json({ message: 'Failed to fetch availability' });
  }
};

/**
 * PATCH /api/workspaces/:workspaceId/staff/:staffId/availability
 * Update availability (weekly schedule)
 */
export const updateStaffAvailability = async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId, staffId } = req.params;
    const data = req.body;

    if (!workspaceId || !staffId) {
      return res.status(400).json({ message: 'Workspace ID and Staff ID are required' });
    }

    // Verify staff belongs to workspace
    const belongs = await verifyStaffBelongsToWorkspace(staffId, workspaceId);
    if (!belongs) {
      return res.status(403).json({ message: 'Staff member not found in this workspace' });
    }

    // Validate time format if provided (HH:MM)
    const timePattern = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
    const timeFields = [
      'monStartTime', 'monEndTime', 'tueStartTime', 'tueEndTime',
      'wedStartTime', 'wedEndTime', 'thuStartTime', 'thuEndTime',
      'friStartTime', 'friEndTime', 'satStartTime', 'satEndTime',
      'sunStartTime', 'sunEndTime'
    ];

    for (const field of timeFields) {
      if (data[field] !== null && data[field] !== undefined && !timePattern.test(data[field])) {
        return res.status(400).json({ message: `Invalid time format for ${field}. Use HH:MM (24-hour)` });
      }
    }

    const updated = await updateAvailability(staffId, data);

    return res.json(updated);
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error updating staff availability:', error);
    return res.status(500).json({ message: 'Failed to update availability' });
  }
};

/**
 * GET /api/workspaces/:workspaceId/coverage-gaps
 * Check coverage gaps for upcoming sales
 * Query param: saleId (optional)
 */
export const checkCoverageGaps = async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const { saleId } = req.query;

    if (!workspaceId) {
      return res.status(400).json({ message: 'Workspace ID is required' });
    }

    const gaps = await getCoverageGaps(
      workspaceId,
      saleId ? (saleId as string) : undefined
    );

    return res.json(gaps);
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error checking coverage gaps:', error);
    return res.status(500).json({ message: 'Failed to check coverage gaps' });
  }
};

/**
 * GET /api/workspaces/:workspaceId/staff/:staffId/performance
 * Get performance snapshot
 * Query param: period (optional, e.g., "WEEKLY", "MONTHLY")
 */
export const getStaffPerformance = async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId, staffId } = req.params;
    const { period } = req.query;

    if (!workspaceId || !staffId) {
      return res.status(400).json({ message: 'Workspace ID and Staff ID are required' });
    }

    // Verify staff belongs to workspace
    const belongs = await verifyStaffBelongsToWorkspace(staffId, workspaceId);
    if (!belongs) {
      return res.status(403).json({ message: 'Staff member not found in this workspace' });
    }

    const performance = await getPerformanceSnapshot(
      staffId,
      period ? (period as string) : undefined
    );

    return res.json(performance);
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error fetching staff performance:', error);
    return res.status(500).json({ message: 'Failed to fetch performance' });
  }
};

/**
 * DELETE /api/workspaces/:workspaceId/staff/:staffId
 * Remove a staff member from workspace (owner only)
 * Guard: cannot remove a workspace owner
 */
export const deleteStaff = async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId, staffId } = req.params;

    if (!workspaceId || !staffId) {
      return res.status(400).json({ message: 'Workspace ID and Staff ID are required' });
    }

    // Verify staff belongs to workspace
    const belongs = await verifyStaffBelongsToWorkspace(staffId, workspaceId);
    if (!belongs) {
      return res.status(403).json({ message: 'Staff member not found in this workspace' });
    }

    // Get the staff member to check their role
    const staff = await getStaffMember(staffId);
    if (staff.workspaceMember?.role === 'OWNER') {
      return res.status(403).json({ message: 'Workspace owner cannot be removed' });
    }

    // Remove the staff member
    const result = await removeStaffMember(staffId);

    return res.json({ message: 'Staff member removed successfully', ...result });
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error removing staff member:', error);
    return res.status(500).json({ message: 'Failed to remove staff member' });
  }
};

/* ===========================================================================
 * Register Access (2026-07-28)
 *
 * The register (pages/organizer/hubs/[hubId]/cart.tsx) lets a caller in only if
 * requireBoothAuth.ts:153-168 finds their accepted WorkspaceMember WITH a linked
 * TeamMember. Before this, no route in the repo could create that link, so a
 * person could be invited, accept, and still be 403'd with NOT_TEAM_MEMBER
 * (requireBoothAuth.ts:167). These endpoints are the owner's switch for it.
 * =========================================================================== */

/**
 * Read guard: the workspace owner, or any accepted member of that workspace.
 *
 * Membership half is copied from requireWorkspaceMember()
 * (middleware/workspaceAuth.ts:64-74): same workspaceId + acceptedAt not null +
 * organizerId OR userId shape. The owner half is added on top because an owner
 * onboarded through routes/users.ts:442-450 gets an OrganizerWorkspace and no
 * WorkspaceMember row at all, and would otherwise be locked out of their own
 * team page.
 */
const resolveWorkspaceForRead = async (
  req: AuthRequest,
  res: Response,
  workspaceId: string
): Promise<boolean> => {
  const workspace = await prisma.organizerWorkspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, ownerId: true },
  });

  if (!workspace) {
    res.status(404).json({ message: 'Workspace not found' });
    return false;
  }

  const organizerId = req.user?.organizerProfile?.id;
  if (organizerId && workspace.ownerId === organizerId) {
    return true;
  }

  if (!req.user?.id) {
    res.status(401).json({ message: 'Unauthorized' });
    return false;
  }

  const member = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId,
      acceptedAt: { not: null },
      OR: [
        ...(organizerId ? [{ organizerId }] : []),
        { userId: req.user.id },
      ],
    },
    select: { id: true },
  });

  if (!member) {
    res.status(403).json({ message: 'You are not a member of this workspace' });
    return false;
  }

  return true;
};

/**
 * Write guard: workspace owner only.
 *
 * Copied line for line from removeMember (workspaceController.ts:263-268) — the
 * sibling owner-only endpoint on the same workspace — with one extra check that
 * the workspace the owner owns is the one named in the URL.
 */
const resolveWorkspaceForWrite = async (
  req: AuthRequest,
  res: Response,
  workspaceId: string
): Promise<boolean> => {
  const organizerId = req.user?.organizerProfile?.id;
  if (!organizerId) {
    res.status(401).json({ message: 'Unauthorized' });
    return false;
  }

  const workspace = await prisma.organizerWorkspace.findUnique({ where: { ownerId: organizerId } });
  if (!workspace) {
    res.status(404).json({ message: 'Workspace not found' });
    return false;
  }
  if (workspace.ownerId !== organizerId) {
    res.status(403).json({ message: 'Only the market owner can change register access' });
    return false;
  }
  if (workspace.id !== workspaceId) {
    res.status(403).json({ message: 'Only the market owner can change register access' });
    return false;
  }

  return true;
};

/**
 * GET /api/workspaces/:workspaceId/register-access
 * Everyone on the team, and whether each of them can work the register.
 */
export const getRegisterAccess = async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;
    if (!workspaceId || typeof workspaceId !== 'string') {
      return res.status(400).json({ message: 'Workspace ID is required' });
    }

    const allowed = await resolveWorkspaceForRead(req, res, workspaceId);
    if (!allowed) return;

    const result = await listRegisterAccess(workspaceId);
    if (!result) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    return res.json(result);
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error listing register access:', error);
    return res.status(500).json({ message: 'Failed to load register access' });
  }
};

/**
 * POST /api/workspaces/:workspaceId/register-access/:workspaceMemberId
 * Give one person register access. Owner only. Safe to call twice.
 */
export const giveRegisterAccess = async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId, workspaceMemberId } = req.params;
    if (!workspaceId || !workspaceMemberId) {
      return res.status(400).json({ message: 'Workspace ID and member ID are required' });
    }

    const allowed = await resolveWorkspaceForWrite(req, res, workspaceId);
    if (!allowed) return;

    const result = await grantRegisterAccess(workspaceId, workspaceMemberId);

    if (!result.ok) {
      if (result.code === 'INVITE_NOT_ACCEPTED') {
        return res.status(400).json({
          message: 'This person has not accepted their invite yet. You can turn on register access once they do.',
          code: 'INVITE_NOT_ACCEPTED',
        });
      }
      return res.status(404).json({ message: 'That person is not on this team', code: 'MEMBER_NOT_FOUND' });
    }

    return res.json({ canWorkRegister: true, teamMemberId: result.teamMemberId });
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error giving register access:', error);
    return res.status(500).json({ message: 'Failed to give register access' });
  }
};

/**
 * DELETE /api/workspaces/:workspaceId/register-access/:workspaceMemberId
 * Take register access away. Owner only. Safe to call on someone who never had it.
 */
export const takeRegisterAccess = async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId, workspaceMemberId } = req.params;
    if (!workspaceId || !workspaceMemberId) {
      return res.status(400).json({ message: 'Workspace ID and member ID are required' });
    }

    const allowed = await resolveWorkspaceForWrite(req, res, workspaceId);
    if (!allowed) return;

    const result = await revokeRegisterAccess(workspaceId, workspaceMemberId);

    if (!result.ok) {
      return res.status(404).json({ message: 'That person is not on this team', code: 'MEMBER_NOT_FOUND' });
    }

    return res.json({ canWorkRegister: false, removed: result.removed });
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error taking register access:', error);
    return res.status(500).json({ message: 'Failed to take register access' });
  }
};
