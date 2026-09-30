import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { spendXp, getSpendableXp, XP_SINKS } from '../services/xpService';
import {
  MAX_CREW_MEMBERS,
  MAX_CREWS_PER_USER,
  validateCrewName,
  validateCrewDescription,
} from '../services/crewService';
import { findRedeemableCrewInvasionCode } from '../services/crewInvasionRedemptionService';
import { opaqueUserId, resolveUserRef } from '../utils/opaqueUserId';
import { publicMemberLabel } from '../utils/publicDisplayName';

/**
 * Shopper Crews: controller.
 *
 * Rules enforced server-side (the UI and /guides/crews describe exactly these):
 *  - Crews are public. Anyone signed in can join instantly while the crew has room.
 *  - Max 50 members per crew, max 3 crews per account (created or joined).
 *  - Creating a crew costs 500 XP (CREW_CREATION sink). The XP spend, the crew row and the
 *    founding membership are ONE transaction, so a failure never costs the founder XP.
 *  - A founder cannot leave. They transfer the crew to a member, or disband it.
 */

/** Business-rule failure with an HTTP status the client can show as-is. */
class CrewRuleError extends Error {
  status: number;
  code: string;
  extra?: Record<string, unknown>;
  constructor(status: number, code: string, message: string, extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

function sendRuleError(res: Response, err: unknown): boolean {
  if (err instanceof CrewRuleError) {
    res.status(err.status).json({ message: err.message, code: err.code, ...(err.extra || {}) });
    return true;
  }
  return false;
}

const USER_PUBLIC_SELECT = {
  id: true,
  name: true,
  profileSlug: true,
  guildXp: true,
  explorerRank: true,
  notificationPrefs: true, // only read to apply the public-name opt-in gate; never returned
} as const;

type CrewDb = Pick<typeof prisma, 'crew'>;

/**
 * Public-safe identity (2026-09-29, data minimization). Crew endpoints are readable by anyone, so a
 * member is never shown with a full name, and the real user id / profile slug only appear where the
 * member's collector passport is public (the only case where /shopper/profile/[id] resolves).
 * Everyone else gets an opaque, stable id in the same `id` field plus name "First L.".
 *   id             real user id when the passport is public, otherwise the opaque id
 *   ref            ALWAYS the opaque id: what the founder tools send back to the server
 *   profilePublic  true when `id` is a real id the profile page can resolve
 */
interface PublicIdentity {
  id: string;
  ref: string;
  name: string;
  profileSlug: string | null;
  profilePublic: boolean;
}

interface IdentitySource {
  id: string;
  name?: string | null;
  notificationPrefs?: unknown;
  profileSlug?: string | null;
}

/** Which of these user ids have a public collector passport. */
async function loadPublicPassportIds(userIds: string[]): Promise<Set<string>> {
  const unique = Array.from(new Set(userIds));
  if (unique.length === 0) return new Set();
  const rows = await prisma.collectorPassport.findMany({
    where: { userId: { in: unique }, isPublic: true },
    select: { userId: true },
  });
  return new Set((rows || []).map((r: { userId: string }) => r.userId));
}

function toPublicIdentity(u: IdentitySource, publicIds: Set<string>): PublicIdentity {
  const isPublic = publicIds.has(u.id);
  const ref = opaqueUserId(u.id);
  return {
    id: isPublic ? u.id : ref,
    ref,
    name: publicMemberLabel(u.name, u.notificationPrefs),
    profileSlug: isPublic ? u.profileSlug ?? null : null,
    profilePublic: isPublic,
  };
}

/**
 * Turn a client-supplied member reference (opaque id from the roster, or a real id) into the real
 * user id of a member of THIS crew. Resolution is scoped to the crew's own member list.
 */
async function resolveCrewMemberRef(crewId: string, ref: unknown): Promise<string | null> {
  if (typeof ref !== 'string' || !ref || ref.length > 80) return null;
  const rows = await prisma.crewMember.findMany({ where: { crewId }, select: { userId: true } });
  return resolveUserRef(ref, (rows || []).map((r: { userId: string }) => r.userId));
}

/** Case-insensitive name match OR identical slug (names that differ only by punctuation). */
async function findNameClash(db: CrewDb, name: string, slug: string) {
  return db.crew.findFirst({
    where: {
      OR: [{ name: { equals: name, mode: 'insensitive' } }, { slug }],
    },
    select: { id: true },
  });
}

function nameTakenError(): CrewRuleError {
  return new CrewRuleError(
    409,
    'CREW_NAME_TAKEN',
    'A crew with that name (or a very similar one) already exists. Please pick a different name.',
  );
}

function crewLimitError(): CrewRuleError {
  return new CrewRuleError(
    409,
    'CREW_LIMIT_REACHED',
    `You can be in up to ${MAX_CREWS_PER_USER} crews at once. Leave a crew to make room.`,
    { maxCrewsPerUser: MAX_CREWS_PER_USER },
  );
}

function parseIntParam(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'string' ? parseInt(value, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Delete one membership and decrement the denormalized count, atomically. */
async function removeMembership(crewId: string, userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const deleted = await tx.crewMember.deleteMany({ where: { crewId, userId } });
    if (deleted.count === 0) {
      throw new CrewRuleError(404, 'NOT_A_MEMBER', 'Member not found');
    }
    await tx.crew.updateMany({
      where: { id: crewId, memberCount: { gt: 0 } },
      data: { memberCount: { decrement: 1 } },
    });
  });
}

/**
 * Create a new crew (shopper social feature)
 * Costs 500 XP. XP spend + crew + founder membership are one transaction.
 */
export async function createCrew(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const userId: string = req.user.id;
    const cost = XP_SINKS.CREW_CREATION;

    const nameCheck = validateCrewName(req.body?.name);
    if (!nameCheck.ok) {
      return res.status(400).json({ message: nameCheck.message, code: nameCheck.code });
    }
    const descCheck = validateCrewDescription(req.body?.description);
    if (!descCheck.ok) {
      return res.status(400).json({ message: descCheck.message, code: descCheck.code });
    }
    const { name, slug } = nameCheck.value;
    const description = descCheck.value;

    // Friendly pre-checks (the transaction below re-checks them, so races cannot cost XP).
    const held = await prisma.crewMember.count({ where: { userId } });
    if (held >= MAX_CREWS_PER_USER) throw crewLimitError();

    if (await findNameClash(prisma, name, slug)) throw nameTakenError();

    const spendable = await getSpendableXp(userId);
    if (spendable < cost) {
      return res.status(400).json({
        message: `Creating a crew costs ${cost} XP. You have ${spendable} spendable XP. Newly earned XP is held for 72 hours before it can be spent.`,
        code: 'INSUFFICIENT_XP',
        required: cost,
        spendable,
      });
    }

    const crew = await prisma.$transaction(
      async (tx) => {
        const heldNow = await tx.crewMember.count({ where: { userId } });
        if (heldNow >= MAX_CREWS_PER_USER) throw crewLimitError();
        if (await findNameClash(tx, name, slug)) throw nameTakenError();

        const spent = await spendXp(
          userId,
          cost,
          'CREW_CREATION',
          { description: `Created crew: ${name}` },
          tx,
        );
        if (!spent) {
          throw new CrewRuleError(
            400,
            'INSUFFICIENT_XP',
            `Creating a crew costs ${cost} XP and you do not have enough available right now.`,
            { required: cost },
          );
        }

        const newCrew = await tx.crew.create({
          data: {
            name,
            slug,
            description,
            founderUserId: userId,
            isPublic: true,
            memberCount: 1,
          },
        });

        await tx.crewMember.create({
          data: { crewId: newCrew.id, userId, role: 'FOUNDER' },
        });

        return newCrew;
      },
      { timeout: 15000 },
    );

    const after = await prisma.user.findUnique({ where: { id: userId }, select: { guildXp: true } });

    return res.status(201).json({
      id: crew.id,
      name: crew.name,
      slug: crew.slug,
      description: crew.description,
      isPublic: crew.isPublic,
      memberCount: crew.memberCount,
      createdAt: crew.createdAt,
      xpSpent: cost,
      remainingXp: after?.guildXp ?? null,
    });
  } catch (error: any) {
    if (sendRuleError(res, error)) return;
    if (error?.code === 'P2002') {
      // Lost a race on the unique name/slug index. The transaction rolled back, XP untouched.
      const e = nameTakenError();
      return res.status(e.status).json({ message: e.message, code: e.code });
    }
    console.error('[crewController] createCrew error:', error);
    return res.status(500).json({ message: 'Failed to create crew. You were not charged any XP.' });
  }
}

/**
 * Browse public crews (paginated, search by name). Auth optional: signed-in viewers also get
 * isMember so the UI can show Joined instead of Join.
 */
export async function listCrews(req: AuthRequest, res: Response) {
  try {
    const page = parseIntParam(req.query.page, 1, 1, 100000);
    const limit = parseIntParam(req.query.limit, 12, 1, 24);
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 50) : '';

    const where: any = { isPublic: true };
    if (search) where.name = { contains: search, mode: 'insensitive' };

    const [total, rows] = await Promise.all([
      prisma.crew.count({ where }),
      prisma.crew.findMany({
        where,
        orderBy: [{ memberCount: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          memberCount: true,
          createdAt: true,
          founder: { select: { id: true, name: true, notificationPrefs: true } },
        },
      }),
    ]);

    let memberOf = new Set<string>();
    if (req.user && rows.length > 0) {
      const mine = await prisma.crewMember.findMany({
        where: { userId: req.user.id, crewId: { in: rows.map((r) => r.id) } },
        select: { crewId: true },
      });
      memberOf = new Set(mine.map((m) => m.crewId));
    }

    const founderIds = rows.map((c) => c.founder?.id).filter((id): id is string => !!id);
    const publicIds = await loadPublicPassportIds(founderIds);

    return res.json({
      crews: rows.map((c) => {
        const founder = c.founder ? toPublicIdentity(c.founder, publicIds) : undefined;
        return {
          id: c.id,
          name: c.name,
          slug: c.slug,
          description: c.description,
          memberCount: c.memberCount,
          createdAt: c.createdAt,
          founder: founder ? { id: founder.id, name: founder.name, profilePublic: founder.profilePublic } : undefined,
          isFull: c.memberCount >= MAX_CREW_MEMBERS,
          isMember: memberOf.has(c.id),
        };
      }),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      maxMembers: MAX_CREW_MEMBERS,
    });
  } catch (error) {
    console.error('[crewController] listCrews error:', error);
    return res.status(500).json({ message: 'Failed to load crews' });
  }
}

/**
 * The signed-in user's crews plus everything the Create tab needs: cost, spendable XP and limits.
 */
export async function getMyCrews(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const userId: string = req.user.id;

    const [memberships, spendable, me] = await Promise.all([
      prisma.crewMember.findMany({
        where: { userId },
        orderBy: { joinedAt: 'asc' },
        select: {
          role: true,
          joinedAt: true,
          crew: {
            select: {
              id: true,
              name: true,
              slug: true,
              description: true,
              memberCount: true,
              createdAt: true,
            },
          },
        },
      }),
      getSpendableXp(userId),
      prisma.user.findUnique({ where: { id: userId }, select: { guildXp: true } }),
    ]);

    return res.json({
      crews: memberships.map((m) => ({
        ...m.crew,
        role: m.role,
        joinedAt: m.joinedAt,
        isFull: m.crew.memberCount >= MAX_CREW_MEMBERS,
      })),
      limits: {
        maxCrewsPerUser: MAX_CREWS_PER_USER,
        maxMembers: MAX_CREW_MEMBERS,
        creationCost: XP_SINKS.CREW_CREATION,
      },
      xp: {
        guildXp: me?.guildXp ?? 0,
        spendable,
      },
    });
  } catch (error) {
    console.error('[crewController] getMyCrews error:', error);
    return res.status(500).json({ message: 'Failed to load your crews' });
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
        founder: { select: USER_PUBLIC_SELECT },
        members: {
          orderBy: { joinedAt: 'asc' },
          include: { user: { select: USER_PUBLIC_SELECT } },
        },
      },
    });

    if (!crew) {
      return res.status(404).json({ message: 'Crew not found' });
    }

    const publicIds = await loadPublicPassportIds([crew.founder?.id, ...crew.members.map((m) => m.userId)].filter((x): x is string => !!x));
    const viewerId: string | undefined = req.user?.id;
    const viewerMembership = viewerId ? crew.members.find((m) => m.userId === viewerId) : undefined;

    const shapeUser = (u: any) => {
      const ident = toPublicIdentity(u, publicIds);
      return {
        id: ident.id,
        name: ident.name,
        profileSlug: ident.profileSlug,
        profilePublic: ident.profilePublic,
        guildXp: u.guildXp,
        explorerRank: u.explorerRank,
      };
    };

    res.json({
      id: crew.id,
      name: crew.name,
      slug: crew.slug,
      description: crew.description,
      isPublic: crew.isPublic,
      memberCount: crew.memberCount,
      maxMembers: MAX_CREW_MEMBERS,
      createdAt: crew.createdAt,
      founder: crew.founder ? shapeUser(crew.founder) : null,
      // The viewer's own standing, computed server-side because member ids are opaque.
      viewer: { isMember: !!viewerMembership, role: viewerMembership?.role ?? null },
      members: crew.members.map((m) => ({
        userId: m.user ? toPublicIdentity(m.user, publicIds).id : opaqueUserId(m.userId),
        memberRef: opaqueUserId(m.userId),
        isSelf: !!viewerId && m.userId === viewerId,
        role: m.role,
        joinedAt: m.joinedAt,
        user: shapeUser(m.user ?? { id: m.userId }),
      })),
    });
  } catch (error) {
    console.error('[crewController] getCrew error:', error);
    res.status(500).json({ message: 'Failed to fetch crew' });
  }
}

/**
 * Get crew leaderboard (members ranked by guild XP, up to the 50-member cap)
 * Public endpoint
 */
export async function getCrewLeaderboard(req: any, res: Response) {
  try {
    const { crewId } = req.params;

    const crew = await prisma.crew.findUnique({ where: { id: crewId } });
    if (!crew) {
      return res.status(404).json({ message: 'Crew not found' });
    }

    const members = await prisma.crewMember.findMany({
      where: { crewId },
      include: { user: { select: USER_PUBLIC_SELECT } },
      orderBy: [{ user: { guildXp: 'desc' } }, { joinedAt: 'asc' }],
      take: MAX_CREW_MEMBERS,
    });

    const publicIds = await loadPublicPassportIds(members.map((m) => m.userId));
    const viewerId: string | undefined = req.user?.id;

    res.json({
      crewId,
      crewName: crew.name,
      members: members.map((m, idx) => {
        const ident = toPublicIdentity(m.user ?? { id: m.userId }, publicIds);
        return {
          rank: idx + 1,
          userId: ident.id,
          memberRef: ident.ref,
          isSelf: !!viewerId && m.userId === viewerId,
          role: m.role,
          joinedAt: m.joinedAt,
          user: {
            id: ident.id,
            name: ident.name,
            profileSlug: ident.profileSlug,
            profilePublic: ident.profilePublic,
            guildXp: m.user?.guildXp ?? 0,
            explorerRank: m.user?.explorerRank ?? 'INITIATE',
          },
        };
      }),
    });
  } catch (error) {
    console.error('[crewController] getCrewLeaderboard error:', error);
    res.status(500).json({ message: 'Failed to fetch leaderboard' });
  }
}

/**
 * Join an existing public crew (authenticated). Instant, no approval step.
 * The 50-member cap is enforced atomically with a conditional increment.
 */
export async function joinCrew(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const userId: string = req.user.id;
    const { crewId } = req.params;

    const crew = await prisma.crew.findUnique({ where: { id: crewId } });
    if (!crew) {
      return res.status(404).json({ message: 'Crew not found' });
    }
    if (!crew.isPublic) {
      return res.status(403).json({ message: 'This crew is not open to join' });
    }

    const memberCount = await prisma.$transaction(async (tx) => {
      const already = await tx.crewMember.findUnique({
        where: { crewId_userId: { crewId, userId } },
      });
      if (already) {
        throw new CrewRuleError(409, 'ALREADY_MEMBER', 'You are already in this crew.');
      }

      const held = await tx.crewMember.count({ where: { userId } });
      if (held >= MAX_CREWS_PER_USER) throw crewLimitError();

      // Conditional increment: only succeeds while there is room, so two people joining the
      // 50th seat at once cannot both get in.
      const bumped = await tx.crew.updateMany({
        where: { id: crewId, memberCount: { lt: MAX_CREW_MEMBERS } },
        data: { memberCount: { increment: 1 } },
      });
      if (bumped.count === 0) {
        throw new CrewRuleError(409, 'CREW_FULL', `This crew is full (max ${MAX_CREW_MEMBERS} members).`);
      }

      await tx.crewMember.create({ data: { crewId, userId, role: 'MEMBER' } });

      const fresh = await tx.crew.findUnique({ where: { id: crewId }, select: { memberCount: true } });
      return fresh?.memberCount ?? crew.memberCount + 1;
    });

    res.json({ success: true, crewId, memberCount });
  } catch (error: any) {
    if (sendRuleError(res, error)) return;
    if (error?.code === 'P2002') {
      return res.status(409).json({ message: 'You are already in this crew.', code: 'ALREADY_MEMBER' });
    }
    console.error('[crewController] joinCrew error:', error);
    res.status(500).json({ message: 'Failed to join crew' });
  }
}

/**
 * Leave a crew. Any member can leave, except the founder, who must transfer the crew to
 * another member or disband it first.
 */
export async function leaveCrew(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const userId: string = req.user.id;
    const { crewId } = req.params;

    const membership = await prisma.crewMember.findUnique({
      where: { crewId_userId: { crewId, userId } },
    });
    if (!membership) {
      return res.status(404).json({ message: 'You are not in this crew', code: 'NOT_A_MEMBER' });
    }
    if (membership.role === 'FOUNDER') {
      return res.status(409).json({
        message: 'You are the founder. Transfer the crew to another member, or disband it, before leaving.',
        code: 'FOUNDER_MUST_TRANSFER_OR_DISBAND',
      });
    }

    await removeMembership(crewId, userId);
    const updated = await prisma.crew.findUnique({ where: { id: crewId }, select: { memberCount: true } });
    res.json({ success: true, crewId, memberCount: updated?.memberCount ?? 0 });
  } catch (error) {
    if (sendRuleError(res, error)) return;
    console.error('[crewController] leaveCrew error:', error);
    res.status(500).json({ message: 'Failed to leave crew' });
  }
}

/**
 * Remove a member from crew. The founder can remove any other member; a member can remove
 * only themselves (same as Leave). The founder cannot remove themselves: transfer or disband.
 */
export async function removeMember(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { crewId, userId: targetRef } = req.params;

    const callerMembership = await prisma.crewMember.findUnique({
      where: { crewId_userId: { crewId, userId: req.user.id } },
    });
    if (!callerMembership) {
      return res.status(403).json({ message: 'Not a crew member' });
    }

    const isFounder = callerMembership.role === 'FOUNDER';
    // The roster only carries opaque ids, so resolve the reference inside THIS crew's members.
    const userId = await resolveCrewMemberRef(crewId, targetRef);
    const isSelf = !!userId && userId === req.user.id;

    if (isFounder && isSelf) {
      return res.status(409).json({
        message: 'You are the founder. Transfer the crew to another member, or disband it, before leaving.',
        code: 'FOUNDER_MUST_TRANSFER_OR_DISBAND',
      });
    }
    if (!isFounder && !isSelf) {
      return res.status(403).json({ message: 'Permission denied' });
    }
    if (!userId) {
      return res.status(404).json({ message: 'Member not found' });
    }

    const targetMembership = await prisma.crewMember.findUnique({
      where: { crewId_userId: { crewId, userId } },
    });
    if (!targetMembership) {
      return res.status(404).json({ message: 'Member not found' });
    }

    await removeMembership(crewId, userId);

    const updatedCrew = await prisma.crew.findUnique({ where: { id: crewId } });
    res.json({ success: true, crewId, memberCount: updatedCrew?.memberCount || 0 });
  } catch (error) {
    if (sendRuleError(res, error)) return;
    console.error('[crewController] removeMember error:', error);
    res.status(500).json({ message: 'Failed to remove member' });
  }
}

/**
 * Founder hands the crew to another member. The old founder becomes a regular member.
 * Body: { userId }
 */
export async function transferFounder(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const { crewId } = req.params;
    const targetRef = typeof req.body?.userId === 'string' ? req.body.userId : '';
    if (!targetRef) {
      return res.status(400).json({ message: 'Choose a member to transfer the crew to.' });
    }
    // Founder tools accept the opaque member id from the roster; it is resolved inside this crew only.
    // Only the founder may probe the roster: a non-founder gets 403 before any resolution result is revealed.
    const callerRow = await prisma.crewMember.findUnique({
      where: { crewId_userId: { crewId, userId: req.user.id } },
    });
    if (!callerRow || callerRow.role !== 'FOUNDER') {
      return res.status(403).json({ message: 'Only the founder can transfer this crew.', code: 'NOT_FOUNDER' });
    }
    const targetUserId = await resolveCrewMemberRef(crewId, targetRef);
    if (!targetUserId) {
      return res.status(404).json({ message: 'That person is not a member of this crew.', code: 'NOT_A_MEMBER' });
    }
    if (targetUserId === req.user.id) {
      return res.status(400).json({ message: 'You are already the founder.' });
    }

    await prisma.$transaction(async (tx) => {
      const caller = await tx.crewMember.findUnique({
        where: { crewId_userId: { crewId, userId: req.user!.id } },
      });
      if (!caller || caller.role !== 'FOUNDER') {
        throw new CrewRuleError(403, 'NOT_FOUNDER', 'Only the founder can transfer this crew.');
      }
      const target = await tx.crewMember.findUnique({
        where: { crewId_userId: { crewId, userId: targetUserId } },
      });
      if (!target) {
        throw new CrewRuleError(404, 'NOT_A_MEMBER', 'That person is not a member of this crew.');
      }

      await tx.crewMember.update({ where: { id: target.id }, data: { role: 'FOUNDER' } });
      await tx.crewMember.update({ where: { id: caller.id }, data: { role: 'MEMBER' } });
      await tx.crew.update({ where: { id: crewId }, data: { founderUserId: targetUserId } });
    });

    res.json({ success: true, crewId, founderUserId: opaqueUserId(targetUserId) });
  } catch (error) {
    if (sendRuleError(res, error)) return;
    console.error('[crewController] transferFounder error:', error);
    res.status(500).json({ message: 'Failed to transfer crew' });
  }
}

/**
 * Founder disbands the crew. Requires the crew name typed back as confirmation.
 * Removes all memberships and any Crew Invasion codes. The 500 XP creation cost is not refunded.
 * Body: { confirmName }
 */
export async function disbandCrew(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const { crewId } = req.params;

    const crew = await prisma.crew.findUnique({ where: { id: crewId } });
    if (!crew) {
      return res.status(404).json({ message: 'Crew not found' });
    }
    if (crew.founderUserId !== req.user.id) {
      return res.status(403).json({ message: 'Only the founder can disband this crew.', code: 'NOT_FOUNDER' });
    }

    const confirmName = typeof req.body?.confirmName === 'string' ? req.body.confirmName.trim() : '';
    if (confirmName.toLowerCase() !== crew.name.toLowerCase()) {
      return res.status(400).json({
        message: 'Type the crew name exactly to confirm disbanding.',
        code: 'CONFIRMATION_MISMATCH',
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.crewInvasionCode.deleteMany({ where: { crewId } });
      // CrewMember rows cascade; MissingListingBounty.crewId is set to null by the FK.
      await tx.crew.delete({ where: { id: crewId } });
    });

    res.json({ success: true, crewId });
  } catch (error) {
    if (sendRuleError(res, error)) return;
    console.error('[crewController] disbandCrew error:', error);
    res.status(500).json({ message: 'Failed to disband crew' });
  }
}

/**
 * Crew feed: recent APPROVED photos posted by crew members (up to 20).
 * This is a photo feed only. It does not include saves, holds or chat.
 * Public endpoint
 */
export async function getCrewFeed(req: any, res: Response) {
  try {
    const { crewId } = req.params;

    const crew = await prisma.crew.findUnique({ where: { id: crewId } });
    if (!crew) {
      return res.status(404).json({ message: 'Crew not found' });
    }

    const members = await prisma.crewMember.findMany({
      where: { crewId },
      select: { userId: true },
    });
    const memberIds = members.map((m) => m.userId);

    // Only moderation-approved photos: PENDING and REJECTED uploads must never surface here.
    const photos = await prisma.uGCPhoto.findMany({
      where: {
        userId: { in: memberIds },
        status: 'APPROVED',
      },
      include: {
        user: {
          select: { id: true, name: true, profileSlug: true, explorerRank: true, notificationPrefs: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const publicIds = await loadPublicPassportIds(photos.map((p) => p.user?.id ?? '').filter(Boolean));

    res.json({
      crewId,
      crewName: crew.name,
      photos: photos.map((p) => {
        const ident = toPublicIdentity(p.user ?? { id: '' }, publicIds);
        return {
          id: p.id,
          photoUrl: p.photoUrl,
          caption: p.caption,
          likes: p.likesCount || 0,
          createdAt: p.createdAt,
          user: {
            id: p.user ? ident.id : '',
            name: ident.name,
            profileSlug: ident.profileSlug,
            profilePublic: ident.profilePublic,
            explorerRank: p.user?.explorerRank,
          },
        };
      }),
    });
  } catch (error) {
    console.error('[crewController] getCrewFeed error:', error);
    res.status(500).json({ message: 'Failed to fetch crew feed' });
  }
}

/**
 * GET /api/crews/invasion/active?saleId=...
 * Does the signed-in shopper have a Crew Invasion discount waiting at this sale? The discount
 * applies automatically when the organizer creates the invoice for their held items, so this is
 * informational: it lets the hold/checkout UI show "10% crew discount will be applied".
 * Returns the redeemable code (unused, unexpired, sale still opted in, shopper still in the
 * crew) or { active: false }. The code is only ever shown to a member of that crew.
 */
export async function getMyInvasionDiscount(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const saleId = typeof req.query.saleId === 'string' ? req.query.saleId.trim() : '';
    if (!saleId || saleId.length > 64) {
      return res.status(400).json({ message: 'saleId is required', code: 'SALE_ID_REQUIRED' });
    }
    const code = await findRedeemableCrewInvasionCode({ saleId, shopperUserId: req.user.id });
    if (!code) {
      return res.json({ active: false });
    }
    const row = await prisma.crewInvasionCode.findUnique({
      where: { id: code.id },
      select: { expiresAt: true },
    });
    return res.json({
      active: true,
      code: code.code,
      discountPct: code.discountPct,
      expiresAt: row?.expiresAt ?? null,
      appliesTo: 'HELD_ITEMS_AT_THIS_SALE',
      oneUse: true,
    });
  } catch (error) {
    console.error('[crewController] getMyInvasionDiscount error:', error);
    return res.status(500).json({ message: 'Failed to check crew discount' });
  }
}
