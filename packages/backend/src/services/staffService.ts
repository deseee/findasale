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
    // Get the TeamMember first to find the linked WorkspaceMember
    const teamMember = await prisma.teamMember.findUnique({
      where: { id: staffId },
      select: { workspaceMemberId: true }
    });

    if (!teamMember) {
      throw new Error('Team member not found');
    }

    // Delete the team member (availability and performances will cascade via DB)
    await prisma.teamMember.delete({
      where: { id: staffId }
    });

    // Also explicitly delete the WorkspaceMember to ensure clean removal
    // even if cascade doesn't fire (defensive programming)
    await prisma.workspaceMember.delete({
      where: { id: teamMember.workspaceMemberId }
    }).catch((error: any) => {
      // It's ok if WorkspaceMember is already gone (cascade worked)
      if (error.code !== 'P2025') {
        throw error;
      }
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

/**
 * Register Access (2026-07-28)
 * ---------------------------------------------------------------------------
 * requireBoothAuth.ts:153-168 authorises a register caller by loading the
 * caller's WorkspaceMember (workspaceId + acceptedAt not null + organizerId OR
 * userId match) with `include: { teamMember: { select: { id: true } } }` and
 * rejecting when `!member || !member.teamMember`. The ONLY thing that flips a
 * person from rejected to accepted is the existence of a TeamMember row whose
 * workspaceMemberId points at that accepted WorkspaceMember.
 *
 * These three functions are the owner-facing switch for exactly that row.
 *
 * What we deliberately do NOT write: department, primaryPhone, availability,
 * performances, leaderboard entries and sale assignments are all left absent /
 * null. TeamMember.role is copied from the person's real WorkspaceMember.role
 * (schema.prisma:2747) when it is one of the four staff roles TeamMember
 * documents (schema.prisma:4228); otherwise the model's own default 'MEMBER'
 * is used. Nothing is invented.
 */

const REGISTER_TEAM_ROLES = ['ADMIN', 'MANAGER', 'MEMBER', 'VIEWER'];

export interface RegisterAccessRow {
  workspaceMemberId: string | null;
  name: string;
  email: string | null;
  workspaceRole: string;
  accepted: boolean;
  isOwner: boolean;
  canWorkRegister: boolean;
  teamMemberId: string | null;
}

/**
 * List everyone on the workspace with a plain yes/no on register access.
 *
 * Unlike getStaffMembers() above (which reads prisma.teamMember and therefore
 * can only ever show people who ALREADY have access), this reads
 * prisma.workspaceMember so the owner can see the people who do NOT have it —
 * which is the whole point of the screen.
 */
export const listRegisterAccess = async (workspaceId: string) => {
  try {
    const workspace = await prisma.organizerWorkspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        ownerId: true,
        owner: {
          select: {
            id: true,
            businessName: true,
            user: { select: { name: true, email: true } },
          },
        },
      },
    });

    if (!workspace) {
      return null;
    }

    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      select: {
        id: true,
        role: true,
        acceptedAt: true,
        organizerId: true,
        userId: true,
        organizer: {
          select: {
            id: true,
            businessName: true,
            user: { select: { name: true, email: true } },
          },
        },
        user: { select: { id: true, name: true, email: true } },
        teamMember: { select: { id: true } },
      },
      orderBy: { invitedAt: 'asc' },
    });

    const rows: RegisterAccessRow[] = members.map((m: any) => {
      const email = m.organizer?.user?.email || m.user?.email || null;
      return {
        workspaceMemberId: m.id,
        name:
          m.organizer?.businessName ||
          m.organizer?.user?.name ||
          m.user?.name ||
          email ||
          'Team member',
        email,
        workspaceRole: m.role,
        accepted: m.acceptedAt !== null,
        isOwner: !!m.organizerId && m.organizerId === workspace.ownerId,
        canWorkRegister: !!m.teamMember,
        teamMemberId: m.teamMember?.id ?? null,
      };
    });

    // The owner does not always have a WorkspaceMember row. createWorkspace makes
    // one (workspaceController.ts:34-36) but the TEAMS onboarding path in
    // routes/users.ts:442-450 creates the OrganizerWorkspace and no member row at
    // all. Without this the owner would open the page and not even see themselves.
    // They still reach the register through the HUB_OWNER branch
    // (requireBoothAuth.ts:133-136), so their answer is a truthful "yes".
    if (!rows.some((r) => r.isOwner)) {
      const ownerEmail = workspace.owner?.user?.email || null;
      rows.unshift({
        workspaceMemberId: null,
        name:
          workspace.owner?.businessName ||
          workspace.owner?.user?.name ||
          ownerEmail ||
          'Market owner',
        email: ownerEmail,
        workspaceRole: 'OWNER',
        accepted: true,
        isOwner: true,
        canWorkRegister: true,
        teamMemberId: null,
      });
    }

    return { workspaceId: workspace.id, ownerId: workspace.ownerId, members: rows };
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error listing register access:', error);
    throw error;
  }
};

/**
 * Give one person register access.
 *
 * Idempotent by construction: prisma.teamMember.upsert() keyed on the unique
 * workspaceMemberId (schema.prisma:4226) with an EMPTY update, so a second call
 * creates nothing, throws nothing, and changes nothing on the existing row —
 * an existing rota, department or phone number survives untouched.
 *
 * Refuses when the invite has not been accepted, because requireBoothAuth.ts:156
 * also requires `acceptedAt: { not: null }`; writing a TeamMember for a pending
 * invite would look like it worked and still 403 at the register.
 */
export const grantRegisterAccess = async (workspaceId: string, workspaceMemberId: string) => {
  try {
    const member = await prisma.workspaceMember.findUnique({
      where: { id: workspaceMemberId },
      select: { id: true, workspaceId: true, role: true, acceptedAt: true },
    });

    if (!member || member.workspaceId !== workspaceId) {
      return { ok: false as const, code: 'MEMBER_NOT_FOUND' as const };
    }

    if (!member.acceptedAt) {
      return { ok: false as const, code: 'INVITE_NOT_ACCEPTED' as const };
    }

    const teamRole = REGISTER_TEAM_ROLES.includes(member.role) ? member.role : 'MEMBER';

    try {
      const teamMember = await prisma.teamMember.upsert({
        where: { workspaceMemberId },
        create: { workspaceMemberId, role: teamRole },
        update: {},
        select: { id: true },
      });
      return { ok: true as const, teamMemberId: teamMember.id };
    } catch (error: any) {
      // Two taps landing at once: the unique index on workspaceMemberId wins the
      // race, and the row we wanted now exists. Read it back instead of erroring.
      if (error?.code === 'P2002') {
        const existing = await prisma.teamMember.findUnique({
          where: { workspaceMemberId },
          select: { id: true },
        });
        if (existing) return { ok: true as const, teamMemberId: existing.id };
      }
      throw error;
    }
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error granting register access:', error);
    throw error;
  }
};

/**
 * Take register access away from one person.
 *
 * Deletes ONLY the TeamMember row. It deliberately does not call
 * removeStaffMember() above, which also deletes the WorkspaceMember
 * (staffService.ts:364-371) and would throw the person out of the workspace
 * entirely.
 *
 * Idempotent: a person who never had access produces P2025, which is reported
 * as a success with removed: false rather than an error.
 *
 * Past sales are kept. BoothCartTransaction.cashierTeamMemberId is
 * onDelete: SetNull (schema.prisma:5642), so the transaction rows survive; only
 * the cashier name on them clears.
 */
export const revokeRegisterAccess = async (workspaceId: string, workspaceMemberId: string) => {
  try {
    const member = await prisma.workspaceMember.findUnique({
      where: { id: workspaceMemberId },
      select: { id: true, workspaceId: true },
    });

    if (!member || member.workspaceId !== workspaceId) {
      return { ok: false as const, code: 'MEMBER_NOT_FOUND' as const };
    }

    try {
      await prisma.teamMember.delete({ where: { workspaceMemberId } });
      return { ok: true as const, removed: true };
    } catch (error: any) {
      if (error?.code === 'P2025') {
        return { ok: true as const, removed: false };
      }
      throw error;
    }
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error revoking register access:', error);
    throw error;
  }
};
