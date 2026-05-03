import { prisma } from '../lib/prisma';

/**
 * Crew XP Multiplier — Check if user's crew has visited a sale together today
 * Returns 1.25x multiplier if:
 *   - User is in a crew with 3+ total members
 *   - 2+ OTHER crew members (besides user) visited the same sale today
 * Otherwise returns 1.0x (no bonus)
 *
 * Used when awarding XP for visits, purchases, etc. during crew-based activities
 */
export async function checkCrewVisitBonus(
  userId: string,
  saleId: string
): Promise<number> {
  try {
    // Get user's crew membership(s)
    const crewMemberships = await prisma.crewMember.findMany({
      where: { userId },
      select: { crewId: true },
    });

    if (crewMemberships.length === 0) {
      return 1.0; // User not in any crew
    }

    for (const membership of crewMemberships) {
      // Get all members in this crew
      const crewMembers = await prisma.crewMember.findMany({
        where: { crewId: membership.crewId },
        select: { userId: true },
      });

      // Need at least 3 members total (user + 2 others)
      if (crewMembers.length < 3) {
        continue;
      }

      // Get other crew members' user IDs (exclude self)
      const otherMemberIds = crewMembers
        .map(m => m.userId)
        .filter(id => id !== userId);

      if (otherMemberIds.length < 2) {
        continue;
      }

      // Check how many other crew members visited this sale today
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      const otherVisits = await prisma.pointsTransaction.count({
        where: {
          userId: {
            in: otherMemberIds,
          },
          type: 'SALE_CHECKIN',
          saleId,
          createdAt: {
            gte: today,
          },
        },
      });

      // If 2+ other members visited today, apply bonus
      if (otherVisits >= 2) {
        return 1.25;
      }
    }

    return 1.0; // No crew bonus applies
  } catch (error) {
    console.error('[crewService] Error checking crew visit bonus:', error);
    return 1.0; // Fail safe: no bonus on error
  }
}
