import { prisma } from '../lib/prisma';

// Feature #397: Crew Invasion — flash group discount when ≥3 shoppers hold items in the same sale
// Non-blocking: called fire-and-forget from reservationController after hold creation

const CREW_INVASION_THRESHOLD = 3;
const CREW_INVASION_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const CREW_INVASION_DISCOUNT_PCT = 10;
const CREW_INVASION_COUPON_HOURS = 2;

export async function checkCrewInvasion(saleId: string, triggerUserId: string): Promise<void> {
  // 1. Find distinct users with active holds in this sale in the last 30 min
  const windowStart = new Date(Date.now() - CREW_INVASION_WINDOW_MS);

  const activeHolders = await prisma.itemReservation.findMany({
    where: {
      item: { saleId },
      status: { in: ['PENDING', 'CONFIRMED'] },
      createdAt: { gte: windowStart },
    },
    select: { userId: true },
    distinct: ['userId'],
  });

  if (activeHolders.length < CREW_INVASION_THRESHOLD) return;

  // 2. Check if crew invasion already triggered for this sale today (per triggerUserId)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const alreadyTriggered = await prisma.notification.findFirst({
    where: {
      userId: triggerUserId,
      type: 'crew_invasion',
      createdAt: { gte: todayStart },
      // Link encodes saleId so we're scoped to this sale
      link: `/sales/${saleId}`,
    },
  });
  if (alreadyTriggered) return;

  // 3. Generate a Coupon for each holder (10% off, valid 2 hours)
  const couponExpiresAt = new Date(Date.now() + CREW_INVASION_COUPON_HOURS * 60 * 60 * 1000);

  // 4. Notify all active holders with a coupon
  for (const holder of activeHolders) {
    try {
      const couponCode = `CREW10-${holder.userId.slice(-6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

      // Create a loyalty coupon for the shopper
      await prisma.coupon.create({
        data: {
          code: couponCode,
          userId: holder.userId,
          discountType: 'PERCENT',
          discountValue: CREW_INVASION_DISCOUNT_PCT,
          status: 'ACTIVE',
          expiresAt: couponExpiresAt,
          generatedFromXp: false,
        },
      });

      // Create in-app notification with the coupon code
      await prisma.notification.create({
        data: {
          userId: holder.userId,
          type: 'crew_invasion',
          title: 'Crew Invasion!',
          body: `3+ shoppers are holding items at this sale. Use code ${couponCode} for ${CREW_INVASION_DISCOUNT_PCT}% off your purchase. Valid for ${CREW_INVASION_COUPON_HOURS} hours.`,
          link: `/sales/${saleId}`,
          read: false,
          notificationChannel: 'IN_APP',
          channel: 'DISCOVERY',
        },
      });
    } catch (err) {
      console.error(`[crewInvasion] Failed to notify holder ${holder.userId}:`, err);
    }
  }

  console.log(`[crewInvasion] Triggered for sale ${saleId} — ${activeHolders.length} holders notified`);
}
