import { Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';
import { awardXp, checkMonthlyXpCap, XP_AWARDS } from '../services/xpService';
import { createNotification } from '../services/notificationService';

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

      // Award XP for RSVP (capped 10 XP/month)
      try {
        const remaining = await checkMonthlyXpCap(req.user.id, 'RSVP');
        if (remaining > 0) {
          const xpToAward = Math.min(XP_AWARDS.RSVP, remaining);
          await awardXp(req.user.id, 'RSVP', xpToAward, {
            saleId,
            description: `RSVP to sale: ${sale.title}`,
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

    res.json({ isGoing: !!myRSVP, count });
  } catch (error) {
    console.error('RSVP status error:', error);
    res.status(500).json({ message: 'Server error while fetching RSVP status' });
  }
};

// GET /sales/:id/rsvp/attendees — get list of attendees (names only, for organizer/public modal)
export const getRSVPAttendees = async (req: any, res: Response) => {
  try {
    const { id: saleId } = req.params;

    const attendees = await prisma.saleRSVP.findMany({
      where: { saleId },
      include: {
        user: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      count: attendees.length,
      attendees: attendees.map(rsvp => ({
        id: rsvp.user.id,
        name: rsvp.user.name,
      })),
    });
  } catch (error) {
    console.error('RSVP attendees error:', error);
    res.status(500).json({ message: 'Server error while fetching attendees' });
  }
};
