import { prisma } from '../lib/prisma';
import * as Sentry from '@sentry/node';

/**
 * Staff Service — Team member management, availability, performance tracking
 */

/**
 * Get all staff members for a workspace with availability and performance
 */
export const getStaffMembers = async (workspaceId: string) => {
  try {
    const staff = await prisma.staffMember.findMany({
      where: { workspaceMember: { workspaceId } },
      include: {
        workspaceMember: {
          select: {
            id: true,
            organizerId: true,
            role: true,
            organizer: {
              select: {
                id: true,
                businessName: true,
                user: { select: { email: true, name: true } }
              }
            }
          }
        },
        availability: true,
        performances: {
          orderBy: { createdAt: 'desc' },
          take: 1 // Latest performance period
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    return staff;
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error fetching staff members:', error);
    throw error;
  }
};

/**
 * Get a single staff member with full details
 */
export const getStaffMember = async (staffId: string) => {
  try {
    const staff = await prisma.staffMember.findUnique({
      where: { id: staffId },
      include: {
        workspaceMember: {
          select: {
            id: true,
            workspaceId: true,
            organizerId: true,
            role: true,
            organizer: {
              select: {
                id: true,
                businessName: true,
                user: { select: { email: true, name: true } }
              }
            }
          }
        },
        availability: true,
        performances: { orderBy: { createdAt: 'desc' } },
        leaderboardEntries: { take: 1, orderBy: { createdAt: 'desc' } }
      }
    });

    if (!staff) {
      throw new Error('Staff member not found');
    }

    return staff;
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error fetching staff member:', error);
    throw error;
  }
};

/**
 * Create or update staff profile
 */
export const createOrUpdateStaffProfile = async (
  workspaceMemberId: string,
  data: {
    role?: string;
    department?: string;
    primaryPhone?: string;
  }
) => {
  try {
    // Check if staff member already exists
    const existing = await prisma.staffMember.findUnique({
      where: { workspaceMemberId }
    });

    if (existing) {
      // Update existing
      return await prisma.staffMember.update({
        where: { workspaceMemberId },
        data: {
          role: data.role ?? existing.role,
          department: data.department ?? existing.department,
          primaryPhone: data.primaryPhone ?? existing.primaryPhone,
          updatedAt: new Date()
        },
        include: {
          workspaceMember: {
            select: {
              id: true,
              organizerId: true,
              organizer: {
                select: {
                  id: true,
                  businessName: true,
                  user: { select: { email: true, name: true } }
                }
              }
            }
          },
          availability: true
        }
      });
    } else {
      // Create new
      return await prisma.staffMember.create({
        data: {
          workspaceMemberId,
          role: data.role || 'STAFF',
          department: data.department,
          primaryPhone: data.primaryPhone,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        include: {
          workspaceMember: {
            select: {
              id: true,
              organizerId: true,
              organizer: {
                select: {
                  id: true,
                  businessName: true,
                  user: { select: { email: true, name: true } }
                }
              }
            }
          },
          availability: true
        }
      });
    }
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error creating/updating staff profile:', error);
    throw error;
  }
};

/**
 * Update staff member availability (time slots for week/month)
 */
export const updateAvailability = async (
  staffMemberId: string,
  data: {
    monStartTime?: string | null;
    monEndTime?: string | null;
    tueStartTime?: string | null;
    tueEndTime?: string | null;
    wedStartTime?: string | null;
    wedEndTime?: string | null;
    thuStartTime?: string | null;
    thuEndTime?: string | null;
    friStartTime?: string | null;
    friEndTime?: string | null;
    satStartTime?: string | null;
    satEndTime?: string | null;
    sunStartTime?: string | null;
    sunEndTime?: string | null;
  }
) => {
  try {
    // Check if availability record exists
    const existing = await prisma.staffAvailability.findUnique({
      where: { staffMemberId }
    });

    if (existing) {
      // Update
      return await prisma.staffAvailability.update({
        where: { staffMemberId },
        data: {
          ...data,
          updatedAt: new Date()
        }
      });
    } else {
      // Create
      return await prisma.staffAvailability.create({
        data: {
          staffMemberId,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });
    }
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error updating availability:', error);
    throw error;
  }
};

/**
 * Get availability for a date range (currently returns weekly schedule)
 */
export const getAvailabilityForDateRange = async (
  staffMemberId: string,
  from: Date,
  to: Date
) => {
  try {
    const availability = await prisma.staffAvailability.findUnique({
      where: { staffMemberId }
    });

    if (!availability) {
      return null;
    }

    // Return the weekly schedule template
    // Frontend can apply this to the date range as needed
    return {
      monday: {
        startTime: availability.monStartTime,
        endTime: availability.monEndTime
      },
      tuesday: {
        startTime: availability.tueStartTime,
        endTime: availability.tueEndTime
      },
      wednesday: {
        startTime: availability.wedStartTime,
        endTime: availability.wedEndTime
      },
      thursday: {
        startTime: availability.thuStartTime,
        endTime: availability.thuEndTime
      },
      friday: {
        startTime: availability.friStartTime,
        endTime: availability.friEndTime
      },
      saturday: {
        startTime: availability.satStartTime,
        endTime: availability.satEndTime
      },
      sunday: {
        startTime: availability.sunStartTime,
        endTime: availability.sunEndTime
      },
      dateRange: { from, to }
    };
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error fetching availability for date range:', error);
    throw error;
  }
};

/**
 * Check coverage gaps — which required roles are uncovered for a sale
 */
export const getCoverageGaps = async (workspaceId: string, saleId?: string) => {
  try {
    // Get workspace settings to see required roles
    const workspaceSettings = await prisma.workspaceSettings.findUnique({
      where: { workspaceId }
    });

    // For now, return empty gaps — this would be populated by workspace config
    // Example: { requiredRoles: ['PHOTOGRAPHER', 'CASHIER'], coverage: [...] }
    return [];
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error checking coverage gaps:', error);
    throw error;
  }
};

/**
 * Get performance snapshot for a staff member (current or specified period)
 */
export const getPerformanceSnapshot = async (
  staffMemberId: string,
  period?: string
) => {
  try {
    const query: any = {
      where: { staffMemberId },
      orderBy: { createdAt: 'desc' }
    };

    if (period) {
      query.where.period = period;
    } else {
      query.take = 1; // Latest performance
    }

    const performances = await prisma.staffPerformance.findMany(query);

    if (performances.length === 0) {
      // Return default if no performance record exists
      return {
        staffMemberId,
        period: period || 'CURRENT',
        itemsSold: 0,
        revenue: '0',
        avgItemPrice: '0',
        tasksCompleted: 0,
        createdAt: new Date()
      };
    }

    return performances[0];
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error fetching performance snapshot:', error);
    throw error;
  }
};

/**
 * Verify staff member belongs to workspace
 */
export const verifyStaffBelongsToWorkspace = async (
  staffId: string,
  workspaceId: string
): Promise<boolean> => {
  try {
    const staff = await prisma.staffMember.findUnique({
      where: { id: staffId },
      include: {
        workspaceMember: {
          select: { workspaceId: true }
        }
      }
    });

    if (!staff) {
      return false;
    }

    return staff.workspaceMember.workspaceId === workspaceId;
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error verifying staff workspace membership:', error);
    return false;
  }
};
