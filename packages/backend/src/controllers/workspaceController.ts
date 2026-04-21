import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import * as Sentry from '@sentry/node';
import { AuthRequest } from '../middleware/auth';
import { TIER_LIMITS } from '../constants/tierLimits';
import { TASK_TEMPLATES } from '../utils/taskTemplates';

export const createWorkspace = async (req: AuthRequest, res: Response) => {
  try {
    const { name } = req.body;
    const organizerId = req.user?.organizerProfile?.id;
    if (!organizerId) return res.status(401).json({ message: 'Unauthorized' });
    if (!name || typeof name !== 'string' || name.trim().length === 0)
      return res.status(400).json({ message: 'Workspace name is required' });
    const organizer = await prisma.organizer.findUnique({
      where: { id: organizerId },
      select: { subscriptionTier: true, workspace: true },
    });
    if (!organizer) return res.status(404).json({ message: 'Organizer not found' });
    if (organizer.subscriptionTier !== 'TEAMS') return res.status(403).json({ message: 'TEAMS tier required' });
    if (organizer.workspace) return res.status(400).json({ message: 'Workspace already exists' });
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').substring(0, 50);
    let finalSlug = slug;
    let counter = 0;
    while (true) {
      const existing = await prisma.organizerWorkspace.findUnique({ where: { slug: finalSlug } });
      if (!existing) break;
      counter++;
      finalSlug = `${slug}-${counter}`;
    }
    const workspace = await prisma.organizerWorkspace.create({ data: { name, slug: finalSlug, ownerId: organizerId } });
    // Auto-add owner as OWNER member so workspace middleware grants access
    await prisma.workspaceMember.create({
      data: { workspaceId: workspace.id, organizerId, role: 'OWNER', acceptedAt: new Date() },
    });
    return res.status(201).json(workspace);
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error creating workspace:', error);
    return res.status(500).json({ message: 'Failed to create workspace' });
  }
};

export const getMyWorkspace = async (req: AuthRequest, res: Response) => {
  try {
    const organizerId = req.user?.organizerProfile?.id;
    if (!organizerId) return res.status(401).json({ message: 'Unauthorized' });

    // Common include pattern for workspace queries
    const workspaceInclude = {
      owner: {
        select: {
          id: true,
          businessName: true,
          user: { select: { id: true, name: true, email: true } }
        }
      },
      members: {
        include: {
          organizer: { select: { id: true, businessName: true, profilePhoto: true, user: { select: { email: true } } } },
        },
      },
    };

    let workspace = await prisma.organizerWorkspace.findUnique({
      where: { ownerId: organizerId },
      include: workspaceInclude,
    });

    // If not owner, check if user is a member of a workspace
    if (!workspace) {
      const membership = await prisma.workspaceMember.findFirst({
        where: { organizerId },
        include: {
          workspace: {
            include: workspaceInclude,
          },
        },
      });
      if (membership) workspace = membership.workspace;
    }

    if (!workspace) return res.status(404).json({ message: 'No workspace found' });
    const response = { ...workspace, ownerUserId: workspace.owner?.user?.id || null };
    return res.json(response);
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error fetching workspace:', error);
    return res.status(500).json({ message: 'Failed to fetch workspace' });
  }
};

export const inviteMember = async (req: AuthRequest, res: Response) => {
  try {
    const { email, role } = req.body;
    const organizerId = req.user?.organizerProfile?.id;
    if (!organizerId) return res.status(401).json({ message: 'Unauthorized' });
    if (!email || typeof email !== 'string') return res.status(400).json({ message: 'Email is required' });
    if (!role || !['OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'VIEWER'].includes(role)) return res.status(400).json({ message: 'Invalid role' });

    const workspace = await prisma.organizerWorkspace.findUnique({ where: { ownerId: organizerId } });
    if (!workspace) return res.status(404).json({ message: 'Workspace not found' });

    const requester = await prisma.workspaceMember.findFirst({ where: { workspaceId: workspace.id, organizerId } });
    const isOwner = workspace.ownerId === organizerId;
    const isAdmin = requester && requester.role === 'ADMIN';
    if (!isOwner && !isAdmin) return res.status(403).json({ message: 'Insufficient permissions' });

    // Check member capacity (count pending invites + accepted members)
    const ownerOrganizer = await prisma.organizer.findUnique({ where: { id: organizerId }, select: { isEnterpriseAccount: true } });
    if (!ownerOrganizer?.isEnterpriseAccount) {
      const memberCount = await prisma.workspaceMember.count({ where: { workspaceId: workspace.id } });
      const inviteCount = await prisma.workspaceInvite.count({ where: { workspaceId: workspace.id } });
      const maxMembers = TIER_LIMITS.TEAMS.maxTeamMembers;
      if (memberCount + inviteCount + 1 > maxMembers) {
        return res.status(403).json({ message: `Team member limit (${maxMembers}) reached. Add more seats ($20/mo each) or upgrade to Enterprise for unlimited members.`, code: 'MEMBER_CAP_EXCEEDED', limit: maxMembers, current: memberCount + inviteCount + 1 });
      }
    }

    // Check if already invited or member
    const existingUser = await prisma.user.findUnique({ where: { email }, include: { organizer: { select: { id: true } } } });
    if (existingUser) {
      // Check by organizerId if they're an organizer, or by userId otherwise
      const existingMember = await prisma.workspaceMember.findFirst({
        where: {
          workspaceId: workspace.id,
          acceptedAt: { not: null },
          OR: [
            ...(existingUser.organizer ? [{ organizerId: existingUser.organizer.id }] : []),
            { userId: existingUser.id },
          ],
        },
      });
      if (existingMember) {
        return res.status(400).json({ message: 'Already a member' });
      }
    }

    // Create magic link invite instead of immediate membership
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

    const invite = await prisma.workspaceInvite.create({
      data: {
        workspaceId: workspace.id,
        inviteEmail: email.toLowerCase(),
        role: role as any,
        expiresAt,
      },
    });

    // Send invite email via Resend
    try {
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      const joinLink = `${process.env.FRONTEND_URL || 'https://finda.sale'}/join?token=${invite.inviteToken}`;

      await resend.emails.send({
        from: 'invites@finda.sale',
        to: email,
        subject: `You're invited to join "${workspace.name}" on FindA.Sale`,
        html: `
          <h2>You've been invited to join "${workspace.name}"</h2>
          <p>Click the link below to accept the invitation:</p>
          <p><a href="${joinLink}">${joinLink}</a></p>
          <p>This link expires in 7 days.</p>
        `,
      });
    } catch (emailError) {
      console.error('[workspace-invite] Failed to send invite email:', emailError);
      // Don't fail the request if email fails — the invite was created
    }

    return res.status(201).json({ success: true, inviteEmail: email, inviteToken: invite.inviteToken });
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error inviting member:', error);
    return res.status(500).json({ message: 'Failed to invite member' });
  }
};

export const acceptInvite = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    // Find pending membership by userId or organizerId
    const organizer = await prisma.organizer.findUnique({ where: { userId } });
    const member = await prisma.workspaceMember.findFirst({
      where: {
        acceptedAt: null,
        OR: [
          ...(organizer ? [{ organizerId: organizer.id }] : []),
          { userId },
        ],
      },
    });
    if (!member) return res.status(404).json({ message: 'No pending invitations' });

    // Update WorkspaceMember and create TeamMember in same transaction
    const updated = await prisma.workspaceMember.update({
      where: { id: member.id },
      data: {
        acceptedAt: new Date(),
        // Also ensure TeamMember exists for this WorkspaceMember
        teamMember: {
          connectOrCreate: {
            where: { workspaceMemberId: member.id },
            create: {
              role: member.role || 'MEMBER',
            }
          }
        }
      },
      include: {
        workspace: true,
        organizer: { select: { id: true, businessName: true, profilePhoto: true, user: { select: { email: true } } } },
        user: { select: { id: true, name: true, email: true } }
      },
    });
    return res.json(updated);
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error accepting invite:', error);
    return res.status(500).json({ message: 'Failed to accept invite' });
  }
};

export const getPendingInvitations = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    // Find organizer if user has one
    const organizer = await prisma.organizer.findUnique({ where: { userId } });

    const pendingInvitations = await prisma.workspaceMember.findMany({
      where: {
        acceptedAt: null,
        OR: [
          ...(organizer ? [{ organizerId: organizer.id }] : []),
          { userId },
        ],
      },
      include: {
        workspace: {
          select: { id: true, name: true, slug: true },
        },
      },
      orderBy: { invitedAt: 'desc' },
    });
    return res.json(pendingInvitations);
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error fetching pending invitations:', error);
    return res.status(500).json({ message: 'Failed to fetch pending invitations' });
  }
};

export const removeMember = async (req: AuthRequest, res: Response) => {
  try {
    const { organizerId: targetOrganizerId } = req.params;
    const organizerId = req.user?.organizerProfile?.id;
    if (!organizerId) return res.status(401).json({ message: 'Unauthorized' });
    if (!targetOrganizerId) return res.status(400).json({ message: 'Target organizer ID is required' });
    const workspace = await prisma.organizerWorkspace.findUnique({ where: { ownerId: organizerId } });
    if (!workspace) return res.status(404).json({ message: 'Workspace not found' });
    if (workspace.ownerId !== organizerId) return res.status(403).json({ message: 'Only workspace owner can remove members' });
    if (targetOrganizerId === workspace.ownerId) return res.status(400).json({ message: 'Cannot remove workspace owner' });
    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_organizerId: { workspaceId: workspace.id, organizerId: targetOrganizerId } },
    });
    if (!member) return res.status(404).json({ message: 'Member not found' });
    await prisma.workspaceMember.delete({ where: { id: member.id } });
    return res.json({ message: 'Member removed' });
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error removing member:', error);
    return res.status(500).json({ message: 'Failed to remove member' });
  }
};

export const listMembers = async (req: AuthRequest, res: Response) => {
  try {
    const organizerId = req.user?.organizerProfile?.id;
    if (!organizerId) return res.status(401).json({ message: 'Unauthorized' });
    let workspace = await prisma.organizerWorkspace.findUnique({ where: { ownerId: organizerId } });
    if (!workspace) {
      const membership = await prisma.workspaceMember.findFirst({ where: { organizerId } });
      if (membership) workspace = await prisma.organizerWorkspace.findUnique({ where: { id: membership.workspaceId } });
    }
    if (!workspace) return res.status(404).json({ message: 'Workspace not found' });
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: workspace.id },
      include: { organizer: { select: { id: true, businessName: true, profilePhoto: true, user: { select: { email: true } } } } },
      orderBy: { invitedAt: 'desc' },
    });
    return res.json({ workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug, ownerId: workspace.ownerId }, members });
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error listing members:', error);
    return res.status(500).json({ message: 'Failed to list members' });
  }
};

export const getPublicWorkspace = async (req: AuthRequest, res: Response) => {
  try {
    const { slug } = req.params;
    if (!slug || typeof slug !== 'string') return res.status(400).json({ error: 'Slug is required' });
    const workspace = await prisma.organizerWorkspace.findUnique({
      where: { slug },
      include: {
        owner: {
          select: {
            user: { select: { id: true, name: true, email: true } },
            sales: {
              where: { status: { in: ['PUBLISHED', 'ENDED', 'COMPLETED'] }, deletedAt: null },
              select: { id: true, title: true, startDate: true, endDate: true, city: true, status: true },
              orderBy: { startDate: 'desc' }
            }
          }
        },
        members: {
          select: {
            id: true,
            organizerId: true,
            userId: true,
            role: true,
            acceptedAt: true,
            organizer: { select: { id: true, businessName: true, profilePhoto: true, user: { select: { email: true } } } },
            user: { select: { id: true, name: true, email: true } },
          },
        },
        settings: {
          select: {
            description: true
          }
        }
      },
    });
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

    // Require requester to be the workspace owner or an accepted member
    const requestingUserId = req.user?.id;
    const isOwner = workspace.owner?.user?.id === requestingUserId;
    const isMember = workspace.members.some(
      (m: any) => m.userId === requestingUserId && m.acceptedAt !== null
    );
    if (!isOwner && !isMember) {
      return res.status(403).json({ error: 'You are not a member of this workspace' });
    }

    const memberCount = workspace.members.filter((m: any) => m.acceptedAt !== null).length;
    const ownerName = workspace.owner?.user?.name || workspace.owner?.user?.email || 'Unknown';
    const ownerUserId = workspace.owner?.user?.id || null;
    const description = workspace.settings?.description || null;

    // Separate upcoming and past sales
    const now = new Date();
    const allSales = workspace.owner?.sales || [];
    const upcomingSales = allSales.filter((s: any) => new Date(s.endDate) >= now && s.status === 'PUBLISHED');
    const pastSales = allSales.filter((s: any) => new Date(s.endDate) < now || ['ENDED', 'COMPLETED'].includes(s.status));

    return res.json({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      createdAt: workspace.createdAt,
      memberCount,
      ownerName,
      ownerUserId,
      ownerId: workspace.ownerId,  // Organizer ID for messaging
      description,
      members: workspace.members.map((m: any) => ({
        id: m.id,
        organizerId: m.organizerId,
        role: m.role,
        acceptedAt: m.acceptedAt,
        organizer: m.organizer ? { id: m.organizer.id, businessName: m.organizer.businessName, profilePhoto: m.organizer.profilePhoto, user: m.organizer.user } : null,
        user: m.user ? { id: m.user.id, name: m.user.name, email: m.user.email } : null,
      })),
      upcomingSales: upcomingSales.map((s: any) => ({ id: s.id, title: s.title, startDate: s.startDate, endDate: s.endDate, city: s.city })),
      pastSales: pastSales.map((s: any) => ({ id: s.id, title: s.title, startDate: s.startDate, endDate: s.endDate, city: s.city }))
    });
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error fetching public workspace:', error);
    return res.status(500).json({ message: 'Failed to fetch public workspace' });
  }
};

export const getWorkspaceSettings = async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace ID is required' });

    let settings = await prisma.workspaceSettings.findUnique({ where: { workspaceId } });

    // Create default settings if none exist
    if (!settings) {
      settings = await prisma.workspaceSettings.create({
        data: {
          workspaceId,
          name: null,
          description: null,
          brandRules: null,
          templateUsed: 'SOLO',
          maxMembers: 5,
          enableAnalytics: true,
          enableLeaderboard: true,
          enableTeamChat: true,
          commissionOverride: null,
        },
      });
    }

    // Get member count and owner name
    const workspace = await prisma.organizerWorkspace.findUnique({
      where: { id: workspaceId },
      include: {
        owner: { select: { user: { select: { name: true, email: true } } } },
        members: true,
      },
    });

    if (!workspace) return res.status(404).json({ message: 'Workspace not found' });

    const memberCount = workspace.members.filter((m: any) => m.acceptedAt !== null).length;
    const ownerName = workspace.owner?.user?.name || workspace.owner?.user?.email || 'Unknown';

    let brandRules = null;
    if (settings.brandRules) {
      try { brandRules = JSON.parse(settings.brandRules); } catch { brandRules = settings.brandRules; }
    }

    return res.json({
      id: settings.id,
      workspaceId: settings.workspaceId,
      name: settings.name,
      description: settings.description,
      brandRules,
      templateUsed: settings.templateUsed,
      maxMembers: settings.maxMembers,
      enableAnalytics: settings.enableAnalytics,
      enableLeaderboard: settings.enableLeaderboard,
      enableTeamChat: settings.enableTeamChat,
      commissionOverride: settings.commissionOverride?.toString() || null,
      memberCount,
      ownerName,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    });
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error fetching workspace settings:', error);
    return res.status(500).json({ message: 'Failed to fetch workspace settings' });
  }
};

export const updateWorkspaceSettings = async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const { name, description, brandRules, templateUsed, enableAnalytics, enableLeaderboard, enableTeamChat } = req.body;

    if (!workspaceId) return res.status(400).json({ message: 'Workspace ID is required' });

    const settings = await prisma.workspaceSettings.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        name: name || null,
        description: description || null,
        brandRules: brandRules ? JSON.stringify(brandRules) : null,
        templateUsed: templateUsed || 'SOLO',
        maxMembers: 5,
        enableAnalytics: enableAnalytics !== undefined ? enableAnalytics : true,
        enableLeaderboard: enableLeaderboard !== undefined ? enableLeaderboard : true,
        enableTeamChat: enableTeamChat !== undefined ? enableTeamChat : true,
        commissionOverride: null,
      },
      update: {
        ...(name !== undefined && { name: name || null }),
        ...(description !== undefined && { description: description || null }),
        ...(brandRules !== undefined && { brandRules: brandRules ? JSON.stringify(brandRules) : null }),
        ...(templateUsed !== undefined && { templateUsed }),
        ...(enableAnalytics !== undefined && { enableAnalytics }),
        ...(enableLeaderboard !== undefined && { enableLeaderboard }),
        ...(enableTeamChat !== undefined && { enableTeamChat }),
      },
    });

    const brandRulesParsed = settings.brandRules ? JSON.parse(settings.brandRules) : null;

    return res.json({
      id: settings.id,
      workspaceId: settings.workspaceId,
      name: settings.name,
      description: settings.description,
      brandRules: brandRulesParsed,
      templateUsed: settings.templateUsed,
      maxMembers: settings.maxMembers,
      enableAnalytics: settings.enableAnalytics,
      enableLeaderboard: settings.enableLeaderboard,
      enableTeamChat: settings.enableTeamChat,
      commissionOverride: settings.commissionOverride?.toString() || null,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    });
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error updating workspace settings:', error);
    return res.status(500).json({ message: 'Failed to update workspace settings' });
  }
};

export const applyWorkspaceTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const { template } = req.body;

    if (!workspaceId) return res.status(400).json({ message: 'Workspace ID is required' });
    if (!template || typeof template !== 'string') return res.status(400).json({ message: 'Template name is required' });

    // Import the service and apply template
    const { applyTemplate } = await import('../services/workspacePermissionService');
    await applyTemplate(workspaceId, template);

    // Update the WorkspaceSettings.templateUsed
    const settings = await prisma.workspaceSettings.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        templateUsed: template,
        name: null,
        description: null,
        brandRules: null,
        maxMembers: 5,
        enableAnalytics: true,
        enableLeaderboard: true,
        enableTeamChat: true,
        commissionOverride: null,
      },
      update: { templateUsed: template },
    });

    return res.json({ message: 'Template applied successfully', templateUsed: settings.templateUsed });
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error applying workspace template:', error);
    return res.status(500).json({ message: 'Failed to apply template' });
  }
};

export const getWorkspacePermissions = async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;

    if (!workspaceId) return res.status(400).json({ message: 'Workspace ID is required' });

    const { getPermissionsForRole } = await import('../services/workspacePermissionService');
    const { PERMISSION_CATEGORIES } = await import('../utils/workspacePermissions');

    const roles = ['ADMIN', 'MANAGER', 'MEMBER', 'VIEWER'];
    const result: any[] = [];

    for (const role of roles) {
      const allowedPerms = await getPermissionsForRole(workspaceId, role as any);
      const allowedSet = new Set(allowedPerms);

      // Build categorized permissions structure
      const categorizedPerms = PERMISSION_CATEGORIES.map(category => ({
        category: category.name,
        permissions: category.permissions.map(action => ({
          action,
          allowed: allowedSet.has(action),
        })),
      }));

      result.push({
        role,
        permissions: categorizedPerms,
      });
    }

    return res.json(result);
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error fetching workspace permissions:', error);
    return res.status(500).json({ message: 'Failed to fetch workspace permissions' });
  }
};

export const updateWorkspacePermissions = async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId, role } = req.params;
    const { permissions } = req.body;

    if (!workspaceId) return res.status(400).json({ message: 'Workspace ID is required' });
    if (!role || typeof role !== 'string') return res.status(400).json({ message: 'Role is required' });
    if (!Array.isArray(permissions)) return res.status(400).json({ message: 'Permissions must be an array' });

    const { setPermissionsForRole } = await import('../services/workspacePermissionService');
    await setPermissionsForRole(workspaceId, role as any, permissions);

    return res.json({ message: `Permissions updated for role ${role}`, role, permissions });
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error updating workspace permissions:', error);
    return res.status(500).json({ message: 'Failed to update permissions' });
  }
};

export const getWorkspaceCostCalculator = async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;

    if (!workspaceId) return res.status(400).json({ message: 'Workspace ID is required' });

    const workspace = await prisma.organizerWorkspace.findUnique({
      where: { id: workspaceId },
      include: { members: true },
    });

    if (!workspace) return res.status(404).json({ message: 'Workspace not found' });

    const settings = await prisma.workspaceSettings.findUnique({
      where: { workspaceId },
    });

    const maxMembers = settings?.maxMembers || 5;
    const currentMemberCount = workspace.members.filter((m: any) => m.acceptedAt !== null).length; // owner is in members table
    const additionalSeats = Math.max(0, currentMemberCount - maxMembers);
    const additionalSeatPrice = 20;
    const baseTeamsFee = 79;

    const totalMonthlyCost = baseTeamsFee + additionalSeats * additionalSeatPrice;

    return res.json({
      baseFee: baseTeamsFee,
      currentMembers: currentMemberCount,
      maxMembers,
      additionalSeats,
      additionalSeatsCost: additionalSeats * additionalSeatPrice,
      totalMonthlyCost,
    });
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error calculating workspace cost:', error);
    return res.status(500).json({ message: 'Failed to calculate cost' });
  }
};

export const deleteWorkspace = async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const organizerId = req.user?.organizerProfile?.id;

    if (!organizerId) return res.status(401).json({ message: 'Unauthorized' });
    if (!workspaceId) return res.status(400).json({ message: 'Workspace ID is required' });

    const workspace = await prisma.organizerWorkspace.findUnique({
      where: { id: workspaceId },
      select: { ownerId: true },
    });

    if (!workspace) return res.status(404).json({ message: 'Workspace not found' });
    if (workspace.ownerId !== organizerId) return res.status(403).json({ message: 'Only workspace owner can delete the workspace' });

    // Cascading delete is handled by Prisma schema
    await prisma.organizerWorkspace.delete({ where: { id: workspaceId } });

    return res.json({ message: 'Workspace deleted successfully' });
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error deleting workspace:', error);
    return res.status(500).json({ message: 'Failed to delete workspace' });
  }
};

export const validateInviteToken = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    if (!token || typeof token !== 'string') return res.status(400).json({ valid: false, reason: 'not_found' });

    const invite = await prisma.workspaceInvite.findUnique({
      where: { inviteToken: token },
      include: { workspace: { select: { id: true, name: true, slug: true } } },
    });

    if (!invite) return res.json({ valid: false, reason: 'not_found' });
    if (invite.expiresAt < new Date()) return res.json({ valid: false, reason: 'expired' });

    return res.json({
      valid: true,
      workspaceName: invite.workspace.name,
      workspaceSlug: invite.workspace.slug,
      inviteEmail: invite.inviteEmail,
      role: invite.role,
    });
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error validating invite token:', error);
    return res.status(500).json({ valid: false, reason: 'error' });
  }
};

export const acceptMagicLinkInvite = async (req: AuthRequest, res: Response) => {
  try {
    const { token } = req.params;
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    if (!token || typeof token !== 'string') return res.status(400).json({ message: 'Invalid invite token' });

    const invite = await prisma.workspaceInvite.findUnique({
      where: { inviteToken: token },
      include: { workspace: { select: { id: true, slug: true, name: true } } },
    });

    if (!invite) return res.status(404).json({ message: 'Invite not found' });
    if (invite.expiresAt < new Date()) return res.status(400).json({ message: 'Invite expired' });

    // Get the user to verify email matches
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Find organizer if user has one
    const organizer = await prisma.organizer.findUnique({ where: { userId: user.id } });

    // Create WorkspaceMember in transaction with invite deletion
    // Use organizerId if they're an organizer, userId otherwise
    await prisma.$transaction(async (tx: any) => {
      // Create member
      await tx.workspaceMember.create({
        data: {
          workspaceId: invite.workspace.id,
          ...(organizer ? { organizerId: organizer.id } : { userId: user.id }),
          role: invite.role,
          acceptedAt: new Date(),
        },
      });

      // Delete the invite
      await tx.workspaceInvite.delete({ where: { id: invite.id } });
    });

    return res.json({
      success: true,
      workspaceSlug: invite.workspace.slug,
      workspaceName: invite.workspace.name,
    });
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error accepting invite:', error);
    return res.status(500).json({ message: 'Failed to accept invite' });
  }
};

export const getMyWorkspaceMemberships = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    // Find organizer if user has one
    const organizer = await prisma.organizer.findUnique({ where: { userId } });

    // Find all workspaces where this user is a member (not the owner)
    const memberships = await prisma.workspaceMember.findMany({
      where: {
        acceptedAt: { not: null }, // Only accepted invitations
        OR: [
          ...(organizer ? [{ organizerId: organizer.id }] : []),
          { userId },
        ],
      },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            ownerId: true,
          },
        },
      },
    });

    // Filter out workspaces where this user (if organizer) is the owner
    const organizerId = organizer?.id;
    const teamWorkspaces = memberships
      .filter((m: any) => m.workspace.ownerId !== organizerId)
      .map((m: any) => ({
        workspaceId: m.workspace.id,
        workspaceName: m.workspace.name,
        workspaceSlug: m.workspace.slug,
        role: m.role,
      }));

    return res.json({ memberships: teamWorkspaces });
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error fetching workspace memberships:', error);
    return res.status(500).json({ message: 'Failed to fetch workspace memberships' });
  }
};

export const getWorkspaceSaleChat = async (req: any, res: Response) => {
  try {
    const { workspaceId, saleId } = req.params;
    const organizerId = req.user?.organizerProfile?.id;

    if (!organizerId) return res.status(401).json({ message: 'Unauthorized' });
    if (!workspaceId || !saleId) return res.status(400).json({ message: 'Workspace ID and Sale ID required' });

    // Auto-create WorkspaceSaleChat if it doesn't exist
    let chat = await prisma.workspaceSaleChat.findUnique({
      where: { workspaceId_saleId: { workspaceId, saleId } },
    });

    if (!chat) {
      chat = await prisma.workspaceSaleChat.create({
        data: { workspaceId, saleId },
      });
    }

    // Fetch last 50 messages ordered chronologically (oldest first for scrolling)
    const messages = await prisma.workspaceChatMessage.findMany({
      where: { chatId: chat.id },
      select: {
        id: true,
        content: true,
        createdAt: true,
        organizer: {
          select: {
            id: true,
            businessName: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    return res.json({ messages });
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error fetching workspace sale chat:', error);
    return res.status(500).json({ message: 'Failed to fetch chat messages' });
  }
};

export const postWorkspaceSaleChat = async (req: any, res: Response) => {
  try {
    const { workspaceId, saleId } = req.params;
    const { message } = req.body;
    const organizerId = req.user?.organizerProfile?.id;

    if (!organizerId) return res.status(401).json({ message: 'Unauthorized' });
    if (!workspaceId || !saleId) return res.status(400).json({ message: 'Workspace ID and Sale ID required' });
    if (!message || typeof message !== 'string') return res.status(400).json({ message: 'Message is required' });

    const trimmedMessage = message.trim();
    if (trimmedMessage.length === 0) return res.status(400).json({ message: 'Message cannot be empty' });
    if (trimmedMessage.length > 1000) return res.status(400).json({ message: 'Message cannot exceed 1000 characters' });

    // Get or create WorkspaceSaleChat
    let chat = await prisma.workspaceSaleChat.findUnique({
      where: { workspaceId_saleId: { workspaceId, saleId } },
    });

    if (!chat) {
      chat = await prisma.workspaceSaleChat.create({
        data: { workspaceId, saleId },
      });
    }

    // Create the message
    const createdMessage = await prisma.workspaceChatMessage.create({
      data: {
        chatId: chat.id,
        organizerId,
        content: trimmedMessage,
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        organizer: {
          select: {
            id: true,
            businessName: true,
          },
        },
      },
    });

    return res.status(201).json(createdMessage);
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error posting workspace sale chat message:', error);
    return res.status(500).json({ message: 'Failed to create message' });
  }
};

export const getWorkspaceTasks = async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const { saleId } = req.query;
    const organizerId = req.user?.organizerProfile?.id;

    if (!organizerId) return res.status(401).json({ message: 'Unauthorized' });
    if (!workspaceId) return res.status(400).json({ message: 'Workspace ID required' });

    // Check workspace membership
    const workspace = await prisma.organizerWorkspace.findUnique({
      where: { id: workspaceId },
      include: { members: { where: { organizerId } } },
    });
    if (!workspace || (workspace.ownerId !== organizerId && workspace.members.length === 0)) {
      return res.status(403).json({ message: 'Not a workspace member' });
    }

    // Build query filter
    const where: any = { workspaceId };
    if (saleId && typeof saleId === 'string') {
      where.saleId = saleId;
    }

    const tasks = await prisma.workspaceTask.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        dueAt: true,
        assignedTo: true,
        createdAt: true,
        sale: {
          select: { id: true, title: true },
        },
      },
      orderBy: [
        { status: 'asc' }, // DONE last
        { dueAt: 'asc' },  // soonest first
      ],
    });

    // Format response to include assignedTo name if available
    const formattedTasks = await Promise.all(
      tasks.map(async (task: any) => {
        let assigneeInfo = null;
        if (task.assignedTo) {
          // assignedTo now stores WorkspaceMember.id instead of organizerId
          const member = workspace.members.find((m: any) => m.id === task.assignedTo);
          if (member) {
            // Get the member's name from organizer or user
            let businessName = 'Team Member';
            if (member.organizer?.businessName) {
              businessName = member.organizer.businessName;
            } else if (member.user?.name) {
              businessName = member.user.name;
            } else if (member.organizer?.user?.email) {
              businessName = member.organizer.user.email;
            } else if (member.user?.email) {
              businessName = member.user.email;
            }
            assigneeInfo = { id: member.id, businessName };
          }
        }
        return {
          ...task,
          assignedToInfo: assigneeInfo,
        };
      })
    );

    return res.json({ tasks: formattedTasks });
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error fetching workspace tasks:', error);
    return res.status(500).json({ message: 'Failed to fetch tasks' });
  }
};

export const createWorkspaceTask = async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const { title, description, dueAt, assignedToId, saleId } = req.body;
    const organizerId = req.user?.organizerProfile?.id;

    if (!organizerId) return res.status(401).json({ message: 'Unauthorized' });
    if (!workspaceId) return res.status(400).json({ message: 'Workspace ID required' });
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ message: 'Title is required' });
    }
    if (title.length > 200) return res.status(400).json({ message: 'Title cannot exceed 200 characters' });
    if (!saleId || typeof saleId !== 'string') {
      return res.status(400).json({ message: 'Sale ID is required' });
    }

    // Check workspace membership and role
    const workspace = await prisma.organizerWorkspace.findUnique({
      where: { id: workspaceId },
      include: { members: { where: { organizerId } } },
    });
    if (!workspace) return res.status(404).json({ message: 'Workspace not found' });

    const isOwner = workspace.ownerId === organizerId;
    const member = workspace.members[0];
    const isAdmin = member?.role === 'ADMIN';
    const isManager = member?.role === 'MANAGER';

    if (!isOwner && !isAdmin && !isManager) {
      return res.status(403).json({ message: 'Insufficient permissions to create tasks' });
    }

    // Create task
    const task = await prisma.workspaceTask.create({
      data: {
        workspaceId,
        saleId,
        title: title.trim(),
        description: description && typeof description === 'string' ? description.trim() : null,
        dueAt: dueAt ? new Date(dueAt) : null,
        assignedTo: assignedToId && typeof assignedToId === 'string' ? assignedToId : null,
        status: 'PENDING',
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        dueAt: true,
        assignedTo: true,
        createdAt: true,
        sale: {
          select: { id: true, title: true },
        },
      },
    });

    return res.status(201).json(task);
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error creating workspace task:', error);
    return res.status(500).json({ message: 'Failed to create task' });
  }
};

export const updateWorkspaceTask = async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId, taskId } = req.params;
    const { status, title, description, dueAt, assignedToId } = req.body;
    const organizerId = req.user?.organizerProfile?.id;

    if (!organizerId) return res.status(401).json({ message: 'Unauthorized' });
    if (!workspaceId || !taskId) return res.status(400).json({ message: 'Workspace ID and Task ID required' });

    // Fetch the task
    const task = await prisma.workspaceTask.findUnique({
      where: { id: taskId },
      include: { workspace: { include: { members: { where: { organizerId } } } } },
    });
    if (!task) return res.status(404).json({ message: 'Task not found' });
    if (task.workspaceId !== workspaceId) return res.status(403).json({ message: 'Task does not belong to this workspace' });

    // Check permissions
    // Find the requesting user's workspace membership
    const requestingOrganizerId = req.user?.organizerProfile?.id;
    const membership = task.workspace.members.find(
      (m: any) => m.organizerId === requestingOrganizerId
    );
    const memberRole = membership?.role;

    const isOwner = task.workspace.ownerId === requestingOrganizerId;
    const isAdminOrManager = memberRole === 'ADMIN' || memberRole === 'MANAGER';
    // Check if the requesting user is the assignee (task.assignedTo is now a WorkspaceMember.id)
    const isAssignee = membership && task.assignedTo === membership.id;

    if (!isOwner && !isAdminOrManager && !isAssignee) {
      return res.status(403).json({ message: 'Insufficient permissions to update task' });
    }

    // Assignees can only update status; others can update all fields
    if (!isOwner && !isAdminOrManager && isAssignee && (title || description || dueAt || assignedToId)) {
      return res.status(403).json({ message: 'Assignees can only update task status' });
    }

    // Build update data
    const updateData: any = {};
    if (status && typeof status === 'string' && ['PENDING', 'IN_PROGRESS', 'COMPLETED'].includes(status)) {
      updateData.status = status;
      if (status === 'COMPLETED') {
        updateData.completedAt = new Date();
      } else {
        updateData.completedAt = null;
      }
    }
    if (title !== undefined) {
      if (title && typeof title === 'string' && title.trim().length > 0) {
        if (title.length > 200) return res.status(400).json({ message: 'Title cannot exceed 200 characters' });
        updateData.title = title.trim();
      }
    }
    if (description !== undefined) {
      updateData.description = description && typeof description === 'string' ? description.trim() : null;
    }
    if (dueAt !== undefined) {
      updateData.dueAt = dueAt ? new Date(dueAt) : null;
    }
    if (assignedToId !== undefined) {
      updateData.assignedTo = assignedToId && typeof assignedToId === 'string' ? assignedToId : null;
    }

    const updated = await prisma.workspaceTask.update({
      where: { id: taskId },
      data: updateData,
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        dueAt: true,
        assignedTo: true,
        completedAt: true,
        createdAt: true,
        sale: {
          select: { id: true, title: true },
        },
      },
    });

    return res.json(updated);
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error updating workspace task:', error);
    return res.status(500).json({ message: 'Failed to update task' });
  }
};

export const deleteWorkspaceTask = async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId, taskId } = req.params;
    const organizerId = req.user?.organizerProfile?.id;

    if (!organizerId) return res.status(401).json({ message: 'Unauthorized' });
    if (!workspaceId || !taskId) return res.status(400).json({ message: 'Workspace ID and Task ID required' });

    // Fetch the task
    const task = await prisma.workspaceTask.findUnique({
      where: { id: taskId },
      include: { workspace: { include: { members: { where: { organizerId } } } } },
    });
    if (!task) return res.status(404).json({ message: 'Task not found' });
    if (task.workspaceId !== workspaceId) return res.status(403).json({ message: 'Task does not belong to this workspace' });

    // Check permissions
    const requestingOrganizerId = req.user?.organizerProfile?.id;
    const membership = task.workspace.members.find(
      (m: any) => m.organizerId === requestingOrganizerId
    );
    const memberRole = membership?.role;

    const isOwner = task.workspace.ownerId === requestingOrganizerId;
    const isAdminOrManager = memberRole === 'ADMIN' || memberRole === 'MANAGER';

    if (!isOwner && !isAdminOrManager) {
      return res.status(403).json({ message: 'Insufficient permissions to delete task' });
    }

    // Delete task
    await prisma.workspaceTask.delete({
      where: { id: taskId },
    });

    return res.status(204).send();
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error deleting workspace task:', error);
    return res.status(500).json({ message: 'Failed to delete task' });
  }
};

export const getTaskTemplates = async (req: Request, res: Response) => {
  try {
    return res.json({ templates: TASK_TEMPLATES });
  } catch (error) {
    Sentry.captureException(error);
    console.error('getTaskTemplates error:', error);
    return res.status(500).json({ error: 'Failed to load task templates' });
  }
};
