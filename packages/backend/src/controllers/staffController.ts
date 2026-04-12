import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import * as Sentry from '@sentry/node';
import {
  getStaffMembers,
  getStaffMember,
  createOrUpdateStaffProfile,
  updateAvailability,
  getAvailabilityForDateRange,
  getCoverageGaps,
  getPerformanceSnapshot,
  verifyStaffBelongsToWorkspace
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
