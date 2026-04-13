import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { spendXp } from '../services/xpService';

/**
 * Create a new crew (shopper social feature)
 * Costs 500 XP, generates unique slug from name
 */
export async function createCrew(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { name, description } = req.body;

    // Validate input
    if (!name || name.length < 2 || name.length > 50) {
      return res.status(400).json({
        message: 'Crew name must be between 2 and 50 characters',
      });
    }

    if (description && description.length > 500) {
      return res.status(400).json({
        message: 'Description must not exceed 500 characters',
      });
    }

    // Check user has enough XP
    if (req.user.guildXp < 500) {
      return res.status(400).json({
        message: 'Insufficient XP. Crew creation costs 500 XP.',
        required: 500,
        current: req.user.guildXp,
      });
    }

    // Generate slug from name
    let slug = name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

    // Check slug uniqueness and retry with suffix if taken
    let finalSlug = slug;
    let suffix = 2;
    while (true) {
      const existing = await prisma.crew.findUnique({
        where: { slug: finalSlug },
      });
      if (!existing) break;
      finalSlug = `${slug}-${suffix}`;
      suffix++;
    }

    // Spend XP and create crew in transaction
    const spent = await spendXp(req.user.id, 500, 'CREW_CREATION', {
      description: `Created crew: ${name}`,
    });

    if (!spent) {
      return res.status(400).json({
        message: 'Failed to spend XP. Try again.',
      });
    }

    // Create crew and founder membership
    const crew = await prisma.$transaction(async (tx) => {
      const newCrew = await tx.crew.create({
        data: {
          name,
          slug: finalSlug,
          description,
          founderUserId: req.user!.id,
          isPublic: true,
          memberCount: 1,
        },
      });

      // Add founder as member with FOUNDER role
      await tx.crewMember.create({
        data: {
          crewId: newCrew.id,
          userId: req.user!.id,
          role: 'FOUNDER',
        },
      });

      return newCrew;
    });

    res.status(201).json({
      id: crew.id,
      name: crew.name,
      slug: crew.slug,
      description: crew.description,
      isPublic: crew.isPublic,
      memberCount: crew.memberCount,
      createdAt: crew.createdAt,
    });
  } catch (error) {
    console.error('[crewController] createCrew error:', error);
    res.status(500).json({ message: 'Failed to create crew' });
  }
}

/**
 * Get a crew by ID with founder and members
 * Public endpoint
 */
export async function getCrew(req: any, res: Response) {
  try {
    const { crewId } = req.params;

    const crew = await prisma.crew.findUnique({
      where: { id: crewId },
      include: {
        founder: {
          select: {
            id: true,
            name: true,
            profileSlug: true,
            guildXp: true,
            explorerRank: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                profileSlug: true,
                guildXp: true,
                explorerRank: true,
              },
            },
          },
        },
      },
    });

    if (!crew) {
      return res.status(404).json({ message: 'Crew not found' });
    }

    res.json({
      id: crew.id,
      name: crew.name,
      slug: crew.slug,
      description: crew.description,
      isPublic: crew.isPublic,
      memberCount: crew.memberCount,
      createdAt: crew.createdAt,
      founder: crew.founder,
      members: crew.members.map((m) => ({
        userId: m.userId,
        role: m.role,
        joinedAt: m.joinedAt,
        user: m.user,
      })),
    });
  } catch (error) {
    console.error('[crewController] getCrew error:', error);
    res.status(500).json({ message: 'Failed to fetch crew' });
  }
}

/**
 * Get crew leaderboard (top members by XP, limit 20)
 * Public endpoint
 */
export async function getCrewLeaderboard(req: any, res: Response) {
  try {
    const { crewId } = req.params;

    // Verify crew exists
    const crew = await prisma.crew.findUnique({
      where: { id: crewId },
    });

    if (!crew) {
      return res.status(404).json({ message: 'Crew not found' });
    }

    // Get members sorted by guildXp DESC
    const members = await prisma.crewMember.findMany({
      where: { crewId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            profileSlug: true,
            guildXp: true,
            explorerRank: true,
          },
        },
      },
      orderBy: {
        user: {
          guildXp: 'desc',
        },
      },
      take: 20,
    });

    res.json({
      crewId,
      crewName: crew.name,
      members: members.map((m, idx) => ({
        rank: idx + 1,
        userId: m.userId,
        role: m.role,
        joinedAt: m.joinedAt,
        user: m.user,
      })),
    });
  } catch (error) {
    console.error('[crewController] getCrewLeaderboard error:', error);
    res.status(500).json({ message: 'Failed to fetch leaderboard' });
  }
}

/**
 * Join an existing crew (authenticated)
 */
export async function joinCrew(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { crewId } = req.params;

    // Check crew exists
    const crew = await prisma.crew.findUnique({
      where: { id: crewId },
    });

    if (!crew) {
      return res.status(404).json({ message: 'Crew not found' });
    }

    // Check user not already a member
    const existing = await prisma.crewMember.findUnique({
      where: {
        crewId_userId: {
          crewId,
          userId: req.user.id,
        },
      },
    });

    if (existing) {
      return res.status(400).json({ message: 'Already a crew member' });
    }

    // Check crew not full
    if (crew.memberCount >= 50) {
      return res.status(400).json({ message: 'Crew is full (max 50 members)' });
    }

    // Add member and increment count
    await prisma.$transaction(async (tx) => {
      await tx.crewMember.create({
        data: {
          crewId,
          userId: req.user!.id,
          role: 'MEMBER',
        },
      });

      await tx.crew.update({
        where: { id: crewId },
        data: {
          memberCount: {
            increment: 1,
          },
        },
      });
    });

    res.json({
      success: true,
      crewId,
      memberCount: crew.memberCount + 1,
    });
  } catch (error) {
    console.error('[crewController] joinCrew error:', error);
    res.status(500).json({ message: 'Failed to join crew' });
  }
}

/**
 * Remove a member from crew (founder only or self)
 * If founder removes themselves, promote oldest member
 */
export async function removeMember(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { crewId, userId } = req.params;

    // Get caller's role
    const callerMembership = await prisma.crewMember.findUnique({
      where: {
        crewId_userId: {
          crewId,
          userId: req.user.id,
        },
      },
    });

    if (!callerMembership) {
      return res.status(403).json({ message: 'Not a crew member' });
    }

    // Check permission
    const isFounder = callerMembership.role === 'FOUNDER';
    const isSelf = userId === req.user.id;

    if (!isFounder && !isSelf) {
      return res.status(403).json({ message: 'Permission denied' });
    }

    // Get target member
    const targetMembership = await prisma.crewMember.findUnique({
      where: {
        crewId_userId: {
          crewId,
          userId,
        },
      },
    });

    if (!targetMembership) {
      return res.status(404).json({ message: 'Member not found' });
    }

    // If removing founder, promote oldest member
    if (targetMembership.role === 'FOUNDER') {
      const oldestMember = await prisma.crewMember.findFirst({
        where: { crewId },
        orderBy: { joinedAt: 'asc' },
        skip: 1, // Skip the founder
      });

      if (oldestMember) {
        await prisma.crewMember.update({
          where: { id: oldestMember.id },
          data: { role: 'FOUNDER' },
        });
      }
    }

    // Remove member and decrement count
    await prisma.$transaction(async (tx) => {
      await tx.crewMember.delete({
        where: {
          crewId_userId: {
            crewId,
            userId,
          },
        },
      });

      await tx.crew.update({
        where: { id: crewId },
        data: {
          memberCount: {
            decrement: 1,
          },
        },
      });
    });

    const updatedCrew = await prisma.crew.findUnique({
      where: { id: crewId },
    });

    res.json({
      success: true,
      crewId,
      memberCount: updatedCrew?.memberCount || 0,
    });
  } catch (error) {
    console.error('[crewController] removeMember error:', error);
    res.status(500).json({ message: 'Failed to remove member' });
  }
}

/**
 * Get crew feed (recent haul posts from members)
 * Public endpoint
 */
export async function getCrewFeed(req: any, res: Response) {
  try {
    const { crewId } = req.params;

    // Verify crew exists
    const crew = await prisma.crew.findUnique({
      where: { id: crewId },
    });

    if (!crew) {
      return res.status(404).json({ message: 'Crew not found' });
    }

    // Get member user IDs
    const members = await prisma.crewMember.findMany({
      where: { crewId },
      select: { userId: true },
    });

    const memberIds = members.map((m) => m.userId);

    // Get recent UGC photos from members
    const photos = await prisma.uGCPhoto.findMany({
      where: {
        userId: {
          in: memberIds,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            profileSlug: true,
            explorerRank: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 20,
    });

    res.json({
      crewId,
      crewName: crew.name,
      photos: photos.map((p) => ({
        id: p.id,
        photoUrl: p.photoUrl,
        caption: p.caption,
        likes: p.likesCount || 0,
        createdAt: p.createdAt,
        user: p.user,
      })),
    });
  } catch (error) {
    console.error('[crewController] getCrewFeed error:', error);
    res.status(500).json({ message: 'Failed to fetch crew feed' });
  }
}
