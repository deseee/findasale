import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import * as Sentry from '@sentry/node';
import { AuthRequest } from '../middleware/auth';
import { TIER_LIMITS } from '../constants/tierLimits';

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
      data: { workspaceId: workspace.id, organizerId, role: 'OWNER' },
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
    if (!role || !['OWNER', 'ADMIN', 'MEMBER'].includes(role)) return res.status(400).json({ message: 'Invalid role' });
    const workspace = await prisma.organizerWorkspace.findUnique({ where: { ownerId: organizerId } });
    if (!workspace) return res.status(404).json({ message: 'Workspace not found' });
    const requester = await prisma.workspaceMember.findFirst({ where: { workspaceId: workspace.id, organizerId } });
    const isOwner = workspace.ownerId === organizerId;
    const isAdmin = requester && requester.role === 'ADMIN';
    if (!isOwner && !isAdmin) return res.status(403).json({ message: 'Insufficient permissions' });
    const invitedOrganizer = await prisma.organizer.findFirst({ where: { user: { email } }, select: { id: true } });
    if (!invitedOrganizer) return res.status(404).json({ message: 'Organizer not found' });
    const existing = await prisma.workspaceMember.findUnique({
      where: { workspaceId_organizerId: { workspaceId: workspace.id, organizerId: invitedOrganizer.id } },
    });
    if (existing) return res.status(400).json({ message: 'Already a member' });
    const ownerOrganizer = await prisma.organizer.findUnique({ where: { id: organizerId }, select: { isEnterpriseAccount: true } });
    if (!ownerOrganizer?.isEnterpriseAccount) {
      const memberCount = await prisma.workspaceMember.count({ where: { workspaceId: workspace.id } });
      const maxMembers = TIER_LIMITS.TEAMS.maxTeamMembers;
      if (memberCount + 1 > maxMembers) {
        return res.status(403).json({ message: `Team member limit (${maxMembers}) reached. Add more seats ($20/mo each) or upgrade to Enterprise for unlimited members.`, code: 'MEMBER_CAP_EXCEEDED', limit: maxMembers, current: memberCount + 1 });
      }
    }
    const member = await prisma.workspaceMember.create({
      data: { workspaceId: workspace.id, organizerId: invitedOrganizer.id, role: role as any },
      include: { organizer: { select: { id: true, businessName: true, profilePhoto: true, user: { select: { email: true } } } } },
    });
    return res.status(201).json(member);
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error inviting member:', error);
    return res.status(500).json({ message: 'Failed to invite member' });
  }
};

export const acceptInvite = async (req: AuthRequest, res: Response) => {
  try {
    const organizerId = req.user?.organizerProfile?.id;
    if (!organizerId) return res.status(401).json({ message: 'Unauthorized' });
    const member = await prisma.workspaceMember.findFirst({ where: { organizerId, acceptedAt: null } });
    if (!member) return res.status(404).json({ message: 'No pending invitations' });
    const updated = await prisma.workspaceMember.update({
      where: { id: member.id },
      data: { acceptedAt: new Date() },
      include: { workspace: true, organizer: { select: { id: true, businessName: true, profilePhoto: true, user: { select: { email: true } } } } },
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
    const organizerId = req.user?.organizerProfile?.id;
    if (!organizerId) return res.status(401).json({ message: 'Unauthorized' });
    const pendingInvitations = await prisma.workspaceMember.findMany({
      where: { organizerId, acceptedAt: null },
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

export const getPublicWorkspace = async (req: Request, res: Response) => {
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
        members: true,
        settings: {
          select: {
            description: true
          }
        }
      },
    });
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
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
