import { Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';
import { awardXp, applyHuntPassMultiplier, checkMonthlyXpCap, XP_AWARDS } from '../services/xpService';
import { createNotification } from '../services/notificationService';
import { checkAndAward } from '../services/achievementService'; // Feature #58: Achievement tracking
import { resolveAudienceAccess } from '../utils/audienceAccess';
import { SHOW_NAME_PREF_KEY, firstNameLastInitial, hasOptedIntoPublicName } from '../utils/publicDisplayName';

// POST /sales/:id/rsvp — add/toggle RSVP for current user
export const toggleSaleRSVP = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { id: saleId } = req.params;

    // Check if sale exists
    const sale = await prisma.sale.findUnique({ where: { id: saleId } });
    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    // Check if user already has RSVP'd
    const existingRSVP = await prisma.saleRSVP.findUnique({
      where: {
        saleId_userId: {
          saleId,
          userId: req.user.id,
        },
      },
    });

    if (existingRSVP) {
      // Remove RSVP
      await prisma.saleRSVP.delete({
        where: { id: existingRSVP.id },
      });
      res.json({ message: 'RSVP removed', isGoing: false });
    } else {
      // Add RSVP
      const rsvp = await prisma.saleRSVP.create({
        data: {
          saleId,
          userId: req.user.id,
        },
      });

      // Feature #58: Award SALE_ATTENDED achievement (fire-and-forget)
      checkAndAward(req.user.id, 'SALE_ATTENDED').catch(err =>
        console.warn('[achievement] Failed to check SALE_ATTENDED:', err)
      );

      // Award XP for RSVP (capped 10 XP/month, Hunt Pass 1.5x applied pre-cap)
      try {
        const remaining = await checkMonthlyXpCap(req.user.id, 'RSVP');
        if (remaining > 0) {
          const baseXp = XP_AWARDS.RSVP;
          const multipliedXp = await applyHuntPassMultiplier(req.user.id, baseXp);
          const xpToAward = Math.min(multipliedXp, remaining);
          await awardXp(req.user.id, 'RSVP', xpToAward, {
            saleId,
            description: `RSVP to sale: ${sale.title}`,
            preMultipliedHuntPassXp: true,
          });
        }
      } catch (error) {
        console.error('[rsvpController] Failed to award RSVP XP:', error);
        // Non-blocking: continue if XP award fails
      }

      // Send DISCOVERY notification (Feature #154)
      try {
        await createNotification(
          req.user.id,
          'RSVP_CONFIRMED',
          'Going to this sale!',
          `You've RSVP'd to ${sale.title}. You'll get a reminder on sale day.`,
          `/sales/${saleId}`,
          'DISCOVERY'
        );
      } catch (error) {
        console.error('[rsvpController] Failed to create notification:', error);
        // Non-blocking: continue if notification fails
      }

      res.json({ message: 'RSVP added', isGoing: true, rsvp });
    }
  } catch (error) {
    console.error('RSVP toggle error:', error);
    res.status(500).json({ message: 'Server error while toggling RSVP' });
  }
};

// DELETE /sales/:id/rsvp — remove RSVP for current user
export const removeRSVP = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { id: saleId } = req.params;

    await prisma.saleRSVP.deleteMany({
      where: {
        saleId,
        userId: req.user.id,
      },
    });

    res.json({ message: 'RSVP removed', isGoing: false });
  } catch (error) {
    console.error('RSVP removal error:', error);
    res.status(500).json({ message: 'Server error while removing RSVP' });
  }
};

// GET /sales/:id/rsvp/count — get count of people going (public)
export const getRSVPCount = async (req: any, res: Response) => {
  try {
    const { id: saleId } = req.params;

    const count = await prisma.saleRSVP.count({
      where: { saleId },
    });

    res.json({ count });
  } catch (error) {
    console.error('RSVP count error:', error);
    res.status(500).json({ message: 'Server error while fetching RSVP count' });
  }
};

// GET /sales/:id/rsvp/mine — check if current user has RSVP'd
export const getMyRSVPStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.json({ isGoing: false, count: 0 });
    }

    const { id: saleId } = req.params;

    const myRSVP = await prisma.saleRSVP.findUnique({
      where: {
        saleId_userId: {
          saleId,
          userId: req.user.id,
        },
      },
    });

    const count = await prisma.saleRSVP.count({
      where: { saleId },
    });

    // showName: whether this shopper opted in to being named (first name + last initial) in the
    // public going list. Lets the RSVP modal render the toggle in its true state.
    res.json({ isGoing: !!myRSVP, count, showName: hasOptedIntoPublicName(req.user.notificationPrefs) });
  } catch (error) {
    console.error('RSVP status error:', error);
    res.status(500).json({ message: 'Server error while fetching RSVP status' });
  }
};

// GET /sales/:id/rsvp/attendees — who is going.
// 2026-09-29 (data minimization, GDPR/CCPA): this used to be public and returned every attendee's
// userId and full name. Now (route uses optionalAuthenticate):
//  - the sale's organizer, their workspace staff (broadcast_alerts permission) and admins get the
//    names (audience: 'organizer'), each row keyed by the RSVP id, never a userId;
//  - everyone else gets the count, plus "First name + last initial" ONLY for shoppers who opted in
//    with the showNameInGoingList preference (audience: 'public'); the rest are counted in
//    anonymousCount and never named.
export const getRSVPAttendees = async (req: AuthRequest, res: Response) => {
  try {
    const { id: saleId } = req.params;

    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { id: true, organizerId: true },
    });
    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    const access = await resolveAudienceAccess(req, sale.organizerId);

    const [count, rows] = await Promise.all([
      prisma.saleRSVP.count({ where: { saleId } }),
      prisma.saleRSVP.findMany({
        where: { saleId },
        include: {
          user: {
            select: { name: true, notificationPrefs: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
    ]);

    const attendees = access.allowed
      ? rows.map((rsvp: any) => ({ id: rsvp.id, name: rsvp.user?.name || 'Shopper' }))
      : rows.flatMap((rsvp: any) => {
          if (!hasOptedIntoPublicName(rsvp.user?.notificationPrefs)) return [];
          const label = firstNameLastInitial(rsvp.user?.name);
          return label ? [{ id: rsvp.id, name: label }] : [];
        });

    res.json({
      count,
      audience: access.allowed ? 'organizer' : 'public',
      attendees,
      anonymousCount: Math.max(0, count - attendees.length),
    });
  } catch (error) {
    console.error('RSVP attendees error:', error);
    res.status(500).json({ message: 'Server error while fetching attendees' });
  }
};

// PUT /sales/:id/rsvp/name-visibility — body { show: boolean }
// The shopper's own opt-in (default OFF) to be named in public going lists. It is an account-level
// preference (notificationPrefs.showNameInGoingList), merged so no other preference is touched.
export const setRSVPNameVisibility = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const show = req.body?.show;
    if (typeof show !== 'boolean') {
      return res.status(400).json({ message: 'show must be true or false' });
    }

    const current = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { notificationPrefs: true },
    });
    const currentPrefs =
      current?.notificationPrefs && typeof current.notificationPrefs === 'object' && !Array.isArray(current.notificationPrefs)
        ? (current.notificationPrefs as Record<string, unknown>)
        : {};

    await prisma.user.update({
      where: { id: req.user.id },
      data: { notificationPrefs: { ...currentPrefs, [SHOW_NAME_PREF_KEY]: show } as any },
    });

    res.json({ showName: show });
  } catch (error) {
    console.error('RSVP name visibility error:', error);
    res.status(500).json({ message: 'Server error while saving your preference' });
  }
};
