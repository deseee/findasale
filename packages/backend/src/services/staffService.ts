import { prisma } from '../lib/prisma';
import * as Sentry from '@sentry/node';

/**
 * Staff Service — Team member management, availability, performance tracking
 */

/**
 * Get all team members for a workspace with availability and performance
 */
export const getStaffMembers = async (workspaceId: string) => {
  try {
    const staff = await prisma.teamMember.findMany({
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
    console.error('Error fetching team members:', error);
    throw error;
  }
};

/**
 * Get a single team member with full details
 */
export const getStaffMember = async (staffId: string) => {
  try {
    const staff = await prisma.teamMember.findUnique({
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
      throw new Error('Team member not found');
    }

    return staff;
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error fetching team member:', error);
    throw error;
  }
};

/**
 * Create or update team member profile
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
    // Check if team member already exists
    const existing = await prisma.teamMember.findUnique({
      where: { workspaceMemberId }
    });

    if (existing) {
      // Update existing
      return await prisma.teamMember.update({
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
      return await prisma.teamMember.create({
        data: {
          workspaceMemberId,
          role: data.role || 'MEMBER',
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
    console.error('Error creating/updating team member profile:', error);
    throw error;
  }
};

/**
 * Update team member availability (time slots for week/month)
 */
export const updateAvailability = async (
  teamMemberId: string,
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
    const existing = await prisma.teamMemberAvailability.findUnique({
      where: { teamMemberId }
    });

    if (existing) {
      // Update
      return await prisma.teamMemberAvailability.update({
        where: { teamMemberId },
        data: {
          ...data,
          updatedAt: new Date()
        }
      });
    } else {
      // Create
      return await prisma.teamMemberAvailability.create({
        data: {
          teamMemberId,
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
  teamMemberId: string,
  from: Date,
  to: Date
) => {
  try {
    const availability = await prisma.teamMemberAvailability.findUnique({
      where: { teamMemberId }
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
 * Get performance snapshot for a team member (current or specified period)
 */
export const getPerformanceSnapshot = async (
  teamMemberId: string,
  period?: string
) => {
  try {
    const query: any = {
      where: { teamMemberId },
      orderBy: { createdAt: 'desc' }
    };

    if (period) {
      query.where.period = period;
    } else {
      query.take = 1; // Latest performance
    }

    const performances = await prisma.teamMemberPerformance.findMany(query);

    if (performances.length === 0) {
      // Return default if no performance record exists
      return {
        teamMemberId,
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
 * Remove a team member from workspace
 */
export const removeStaffMember = async (staffId: string) => {
  try {
    // Delete the team member (availability and performances will cascade)
    const deleted = await prisma.teamMember.delete({
      where: { id: staffId }
    });

    return { success: true, deletedId: staffId };
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error removing team member:', error);
    throw error;
  }
};

/**
 * Verify team member belongs to workspace
 */
export const verifyStaffBelongsToWorkspace = async (
  staffId: string,
  workspaceId: string
): Promise<boolean> => {
  try {
    const staff = await prisma.teamMember.findUnique({
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
    console.error('Error verifying team member workspace membership:', error);
    return false;
  }
};
