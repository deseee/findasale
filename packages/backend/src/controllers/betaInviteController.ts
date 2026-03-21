import { Request, Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';

// Helper: generate 8-char uppercase alphanumeric code
const generateInviteCode = (): string => {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
};

// POST /admin/invites — create new invite code
export const createInvite = async (req: AuthRequest, res: Response) => {
  try {
    const { email } = req.body;

    let code = generateInviteCode();
    let isUnique = false;

    // Ensure code is unique
    while (!isUnique) {
      const existing = await prisma.betaInvite.findUnique({
        where: { code }
      });
      if (!existing) {
        isUnique = true;
      } else {
        code = generateInviteCode();
      }
    }

    const invite = await prisma.betaInvite.create({
      data: {
        code,
        email: email?.toLowerCase() || undefined
      }
    });

    res.status(201).json(invite);
  } catch (error) {
    console.error('Error creating invite:', error);
    res.status(500).json({ message: 'Failed to create invite' });
  }
};

// GET /admin/invites — list all invites with status
export const listInvites = async (req: AuthRequest, res: Response) => {
  try {
    // #97: Admin pagination limits — cap at 100 rows max to prevent data exfiltration
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 100);
    const skip = Math.max(0, (Math.max(1, parseInt(req.query.page as string) || 1) - 1) * limit);

    const [invites, total] = await Promise.all([
      prisma.betaInvite.findMany({
        include: {
          usedBy: {
            select: {
              id: true,
              email: true,
              name: true,
              createdAt: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip,
        take: limit,
      }),
      prisma.betaInvite.count(),
    ]);

    // Map to include status
    const invitesWithStatus = invites.map(invite => ({
      ...invite,
      status: invite.usedAt ? 'used' : 'unused'
    }));

    res.json({
      invites: invitesWithStatus,
      pagination: {
        page: Math.max(1, parseInt(req.query.page as string) || 1),
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error listing invites:', error);
    res.status(500).json({ message: 'Failed to list invites' });
  }
};

// POST /invites/validate — check if code is valid (unauthenticated)
export const validateCode = async (req: Request, res: Response) => {
  try {
    const { code, email } = req.body;

    if (!code) {
      return res.status(400).json({ message: 'Code is required' });
    }

    const invite = await prisma.betaInvite.findUnique({
      where: { code: code.toUpperCase() }
    });

    if (!invite) {
      return res.status(400).json({ message: 'Invalid invite code' });
    }

    if (invite.usedAt) {
      return res.status(400).json({ message: 'This invite code has already been used' });
    }

    // If email is restricted on the invite, verify it matches
    if (invite.email && email) {
      const normalizedInviteEmail = invite.email.toLowerCase();
      const normalizedEmail = email.toLowerCase();
      if (normalizedInviteEmail !== normalizedEmail) {
        return res.status(400).json({ message: 'This invite code is restricted to a different email address' });
      }
    }

    res.json({ valid: true, code: invite.code });
  } catch (error) {
    console.error('Error validating invite:', error);
    res.status(500).json({ message: 'Failed to validate invite code' });
  }
};

// POST /invites/redeem — mark code as used during registration
// Called by register endpoint after user creation
export const redeemInvite = async (req: Request, res: Response) => {
  try {
    const { code, userId } = req.body;

    if (!code || !userId) {
      return res.status(400).json({ message: 'Code and userId are required' });
    }

    const invite = await prisma.betaInvite.findUnique({
      where: { code: code.toUpperCase() }
    });

    if (!invite) {
      return res.status(400).json({ message: 'Invalid invite code' });
    }

    if (invite.usedAt) {
      return res.status(400).json({ message: 'This invite code has already been used' });
    }

    // Mark invite as used
    const updatedInvite = await prisma.betaInvite.update({
      where: { code: code.toUpperCase() },
      data: {
        usedAt: new Date(),
        usedById: userId
      }
    });

    res.json({ success: true, invite: updatedInvite });
  } catch (error) {
    console.error('Error redeeming invite:', error);
    res.status(500).json({ message: 'Failed to redeem invite code' });
  }
};

// DELETE /admin/invites/:inviteId — delete an unused invite
export const deleteInvite = async (req: AuthRequest, res: Response) => {
  try {
    const { inviteId } = req.params;

    const invite = await prisma.betaInvite.findUnique({
      where: { id: inviteId }
    });

    if (!invite) {
      return res.status(404).json({ message: 'Invite not found' });
    }

    if (invite.usedAt) {
      return res.status(400).json({ message: 'Cannot delete a used invite code' });
    }

    await prisma.betaInvite.delete({
      where: { id: inviteId }
    });

    res.json({ success: true, message: 'Invite deleted' });
  } catch (error) {
    console.error('Error deleting invite:', error);
    res.status(500).json({ message: 'Failed to delete invite' });
  }
};
