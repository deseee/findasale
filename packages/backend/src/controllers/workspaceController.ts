import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import * as Sentry from '@sentry/node';
import { AuthRequest } from '../middleware/auth';

/**
 * Create a workspace for a TEAMS organizer
 * POST /api/workspace
 * Body: { name: string }
 * Only TEAMS tier organizers can create workspaces
 */
export const createWorkspace = async (req: AuthRequest, res: Response) => {
  try {
    const { name } = req.body;
    const organizerId = req.user?.organizerId;

    if (!organizerId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Workspace name is required' });
    }

    // Verify organizer exists and is TEAMS tier
    const organizer = await prisma.organizer.findUnique({
      where: { id: organizerId },
      select: { subscriptionTier: true, workspace: true },
    });

    if (!organizer) {
      return res.status(404).json({ error: 'Organizer not found' });
    }

    if (organizer.subscriptionTier !== 'TEAMS') {
      return res.status(403).json({ error: 'TEAMS tier required' });
    }

    // Check if organizer already has a workspace
    if (organizer.workspace) {
      return res.status(400).json({ error: 'Workspace already exists' });
    }

    // Generate slug from name
    const slug = name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .substring(0, 50);

    // Ensure slug is unique by appending random suffix if needed
    let finalSlug = slug;
    let counter = 0;
    while (true) {
      const existing = await prisma.organizerWorkspace.findUnique({
        where: { slug: finalSlug },
      });
      if (!existing) break;
      counter++;
      finalSlug = `${slug}-${counter}`;
    }

    const workspace = await prisma.organizerWorkspace.create({
      data: {
        name,
        slug: finalSlug,
        ownerId: organizerId,
      },
    });

    return res.status(201).json(workspace);
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error creating workspace:', error);
    return res.status(500).json({ error: 'Failed to create workspace' });
  }
};

/**
 * Get my workspace (either owned or as a member)
 * GET /api/workspace
 */
export const getMyWorkspace = async (req: AuthRequest, res: Response) => {
  try {
    const organizerId = req.user?.organizerId;

    if (!organizerId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if this organizer owns a workspace
    let workspace = await prisma.organizerWorkspace.findUnique({
      where: { ownerId: organizerId },
      include: {
        members: {
          include: {
            organizer: {
              select: { id: true, businessName: true, profilePhoto: true },
            },
          },
        },
      },
    });

    // If not owner, check if they're a member of any workspace
    if (!workspace) {
      const membership = await prisma.workspaceMember.findFirst({
        where: { organizerId },
        include: {
          workspace: {
            include: {
              members: {
                include: {
                  organizer: {
                    select: { id: true, businessName: true, profilePhoto: true },
                  },
                },
              },
            },
          },
        },
      });

      if (membership) {
        workspace = membership.workspace;
      }
    }

    if (!workspace) {
      return res.status(404).json({ error: 'No workspace found' });
    }

    return res.json(workspace);
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error fetching workspace:', error);
    return res.status(500).json({ error: 'Failed to fetch workspace' });
  }
};

/**
 * Invite a member to the workspace
 * POST /api/workspace/invite
 * Body: { email: string, role: WorkspaceRole }
 * Only workspace OWNER or ADMIN can invite
 */
export const inviteMember = async (req: AuthRequest, res: Response) => {
  try {
    const { email, role } = req.body;
    const organizerId = req.user?.organizerId;

    if (!organizerId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' });
    }

    if (!role || !['OWNER', 'ADMIN', 'MEMBER'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Get the organizer's workspace
    const workspace = await prisma.organizerWorkspace.findUnique({
      where: { ownerId: organizerId },
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Check if requester is OWNER or ADMIN
    const requester = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId: workspace.id,
        organizerId,
      },
    });

    const isOwner = workspace.ownerId === organizerId;
    const isAdmin = requester && requester.role === 'ADMIN';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Find organizer by email
    const invitedOrganizer = await prisma.organizer.findFirst({
      where: {
        user: { email },
      },
      select: { id: true },
    });

    if (!invitedOrganizer) {
      return res.status(404).json({ error: 'Organizer not found' });
    }

    // Check if already a member
    const existing = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_organizerId: {
          workspaceId: workspace.id,
          organizerId: invitedOrganizer.id,
        },
      },
    });

    if (existing) {
      return res.status(400).json({ error: 'Already a member' });
    }

    // Create membership (pending acceptance)
    const member = await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        organizerId: invitedOrganizer.id,
        role: role as any,
      },
      include: {
        organizer: {
          select: { id: true, businessName: true, profilePhoto: true },
        },
      },
    });

    return res.status(201).json(member);
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error inviting member:', error);
    return res.status(500).json({ error: 'Failed to invite member' });
  }
};

/**
 * Accept a workspace invitation
 * POST /api/workspace/accept
 */
export const acceptInvite = async (req: AuthRequest, res: Response) => {
  try {
    const organizerId = req.user?.organizerId;

    if (!organizerId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Find pending invite for this organizer
    const member = await prisma.workspaceMember.findFirst({
      where: {
        organizerId,
        acceptedAt: null,
      },
    });

    if (!member) {
      return res.status(404).json({ error: 'No pending invitations' });
    }

    // Accept the invite
    const updated = await prisma.workspaceMember.update({
      where: { id: member.id },
      data: { acceptedAt: new Date() },
      include: {
        workspace: true,
        organizer: {
          select: { id: true, businessName: true, profilePhoto: true },
        },
      },
    });

    return res.json(updated);
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error accepting invite:', error);
    return res.status(500).json({ error: 'Failed to accept invite' });
  }
};

/**
 * Remove a member from the workspace
 * DELETE /api/workspace/members/:organizerId
 * Only workspace OWNER can remove members
 */
export const removeMember = async (req: AuthRequest, res: Response) => {
  try {
    const { organizerId: targetOrganizerId } = req.params;
    const organizerId = req.user?.organizerId;

    if (!organizerId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!targetOrganizerId) {
      return res.status(400).json({ error: 'Target organizer ID is required' });
    }

    // Get the workspace
    const workspace = await prisma.organizerWorkspace.findUnique({
      where: { ownerId: organizerId },
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Only owner can remove members
    if (workspace.ownerId !== organizerId) {
      return res.status(403).json({ error: 'Only workspace owner can remove members' });
    }

    // Can't remove the owner
    if (targetOrganizerId === workspace.ownerId) {
      return res.status(400).json({ error: 'Cannot remove workspace owner' });
    }

    // Find and delete the membership
    const member = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_organizerId: {
          workspaceId: workspace.id,
          organizerId: targetOrganizerId,
        },
      },
    });

    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    await prisma.workspaceMember.delete({
      where: { id: member.id },
    });

    return res.json({ message: 'Member removed' });
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error removing member:', error);
    return res.status(500).json({ error: 'Failed to remove member' });
  }
};

/**
 * List workspace members
 * GET /api/workspace/members
 */
export const listMembers = async (req: AuthRequest, res: Response) => {
  try {
    const organizerId = req.user?.organizerId;

    if (!organizerId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Find workspace (owned by this organizer or member of)
    let workspace = await prisma.organizerWorkspace.findUnique({
      where: { ownerId: organizerId },
    });

    if (!workspace) {
      const membership = await prisma.workspaceMember.findFirst({
        where: { organizerId },
      });

      if (membership) {
        workspace = await prisma.organizerWorkspace.findUnique({
          where: { id: membership.workspaceId },
        });
      }
    }

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: workspace.id },
      include: {
        organizer: {
          select: { id: true, businessName: true, profilePhoto: true },
        },
      },
      orderBy: { invitedAt: 'desc' },
    });

    return res.json({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        ownerId: workspace.ownerId,
      },
      members,
    });
  } catch (error) {
    Sentry.captureException(error);
    console.error('Error listing members:', error);
    return res.status(500).json({ error: 'Failed to list members' });
  }
};
