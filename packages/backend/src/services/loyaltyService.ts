import { prisma } from '../lib/prisma';

const STAMP_MILESTONES = {
  5: 'BRONZE',
  20: 'SILVER',
  50: 'GOLD',
};

interface PassportData {
  stamps: { type: string; count: number }[];
  milestones: { milestone: number; badgeType: string; earnedAt: Date }[];
  totalStamps: number;
  nextMilestone: string;
  stampsToNextMilestone: number;
}

/**
 * Award a stamp to a shopper for an action (ATTEND_SALE, MAKE_PURCHASE, WRITE_REVIEW, REFER_FRIEND)
 */
export async function awardStamp(
  userId: string,
  type: string,
  saleId?: string
): Promise<void> {
  try {
    // Upsert: create if not exists, increment if exists
    await prisma.shopperStamp.upsert({
      where: { userId_type: { userId, type } },
      update: { count: { increment: 1 } },
      create: { userId, type, count: 1 },
    });

    // Check if a milestone is now reached
    await checkAndAwardMilestone(userId);
  } catch (error) {
    console.error(`Error awarding stamp to user ${userId}:`, error);
    // Fire-and-forget: don't throw, log and continue
  }
}

/**
 * Check if user reached a new milestone and award it
 */
async function checkAndAwardMilestone(userId: string): Promise<void> {
  const stamps = await prisma.shopperStamp.findMany({
    where: { userId },
  });

  const totalStamps = stamps.reduce((sum, s) => sum + s.count, 0);

  // Check milestones in order (5, 20, 50)
  const milestoneValues = [5, 20, 50];
  for (const milestone of milestoneValues) {
    if (totalStamps >= milestone) {
      const existingMilestone = await prisma.stampMilestone.findUnique({
        where: { userId_milestone: { userId, milestone } },
      });

      if (!existingMilestone) {
        // Award new milestone
        const badgeType = STAMP_MILESTONES[milestone as keyof typeof STAMP_MILESTONES];
        await prisma.stampMilestone.create({
          data: {
            userId,
            milestone,
            badgeType,
          },
        });
      }
    }
  }
}

/**
 * Get shopper's loyalty passport data
 */
export async function getPassport(userId: string): Promise<PassportData> {
  const stamps = await prisma.shopperStamp.findMany({
    where: { userId },
  });

  const milestones = await prisma.stampMilestone.findMany({
    where: { userId },
    orderBy: { milestone: 'asc' },
  });

  const totalStamps = stamps.reduce((sum, s) => sum + s.count, 0);

  // Determine next milestone
  const nextMilestoneValue = [5, 20, 50].find((m) => totalStamps < m) || 50;
  const nextMilestone = STAMP_MILESTONES[nextMilestoneValue as keyof typeof STAMP_MILESTONES] || 'GOLD';
  const stampsToNextMilestone = Math.max(0, nextMilestoneValue - totalStamps);

  return {
    stamps: stamps.map((s) => ({ type: s.type, count: s.count })),
    milestones: milestones.map((m) => ({
      milestone: m.milestone,
      badgeType: m.badgeType,
      earnedAt: m.earnedAt,
    })),
    totalStamps,
    nextMilestone,
    stampsToNextMilestone,
  };
}

/**
 * Check if user has active Hunt Pass and if item is within early access embargo
 */
export async function checkEarlyAccess(userId: string, itemId: string): Promise<boolean> {
  // If item has no early access embargo, it's publicly visible
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: { earlyAccessUntil: true },
  });

  if (!item?.earlyAccessUntil) {
    return true; // Item is not embargoed, visible to all
  }

  // Check if current time is before embargo end
  const now = new Date();
  if (now >= item.earlyAccessUntil) {
    return true; // Embargo expired, item is publicly visible
  }

  // Item is embargoed; check if user has active Hunt Pass
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { huntPassActive: true, huntPassExpiry: true },
  });

  if (!user) {
    return false;
  }

  // User has early access if Hunt Pass is active and not expired
  return user.huntPassActive && (!user.huntPassExpiry || user.huntPassExpiry > now);
}
