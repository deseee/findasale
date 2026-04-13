/**
 * xpExpiryCron.ts — Nightly XP expiry and warning job
 * D-XP-002: Locked Decision
 *
 * Runs daily at 02:00 UTC (midnight ET).
 *
 * Logic:
 * 1. Expire XP for users where:
 *    - xpExpiresAt <= NOW() AND
 *    - lifetimeXpEarned < 5000 (not Grandmaster+ exempt)
 *    Action: Set guildXp = 0, reset xpExpiresAt and warning flags
 *
 * 2. Flag 350-day warning for users where:
 *    - xpExpiresAt between NOW()+15d and NOW()+65d (15-65 days remaining) AND
 *    - xpExpiryWarned350 = false (not already warned)
 *    - lifetimeXpEarned < 5000
 *    Action: Set xpExpiryWarned350 = true (flag for in-app notification)
 *
 * 3. Flag 300-day warning for users where:
 *    - xpExpiresAt between NOW()+15d and NOW()+115d (15-115 days remaining) AND
 *    - xpExpiryWarned300 = false (not already warned)
 *    - lifetimeXpEarned < 5000
 *    Action: Set xpExpiryWarned300 = true (flag for in-app notification)
 *
 * In-app notification delivery is handled by the frontend/notification system
 * reading these flags and displaying banners. This job only sets the flags.
 */

import cron from 'node-cron';
import { prisma } from '../lib/prisma';

async function processXpExpiry(): Promise<void> {
  try {
    const now = new Date();

    // 1. EXPIRE XP: Users past expiry date AND not Grandmaster+ exempt
    const expiredUsers = await prisma.user.findMany({
      where: {
        xpExpiresAt: {
          lte: now, // Expiry date has passed
        },
        lifetimeXpEarned: {
          lt: 5000, // NOT Grandmaster+ exempt
        },
        guildXp: {
          gt: 0, // Only if they have XP to expire
        },
      },
      select: {
        id: true,
        guildXp: true,
      },
    });

    for (const user of expiredUsers) {
      // Zero out the XP balance
      await prisma.user.update({
        where: { id: user.id },
        data: {
          guildXp: 0,
          xpExpiresAt: null,
          xpExpiryWarned300: false,
          xpExpiryWarned350: false,
        },
      });

      // Record the expiry in audit log
      await prisma.pointsTransaction.create({
        data: {
          userId: user.id,
          type: 'XP_EXPIRED', // New transaction type for audit trail
          points: -user.guildXp,
          description: `XP balance expired (365 days from last activity)`,
        },
      });

      console.log(`[xpExpiryCron] Expired ${user.guildXp} XP for user ${user.id}`);
    }

    // 2. WARN 350 DAYS: xpExpiresAt in 15–65 day window, not warned yet, not exempt
    const fifteenDaysFromNow = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
    const sixtyFiveDaysFromNow = new Date(now.getTime() + 65 * 24 * 60 * 60 * 1000);

    const warned350Users = await prisma.user.findMany({
      where: {
        xpExpiresAt: {
          gte: fifteenDaysFromNow, // at least 15 days away
          lte: sixtyFiveDaysFromNow, // no more than 65 days away
        },
        xpExpiryWarned350: false, // Not yet warned
        lifetimeXpEarned: {
          lt: 5000, // NOT exempt
        },
        guildXp: {
          gt: 0, // Only warn if they have XP
        },
      },
      select: { id: true },
    });

    for (const user of warned350Users) {
      await prisma.user.update({
        where: { id: user.id },
        data: { xpExpiryWarned350: true },
      });
    }

    console.log(`[xpExpiryCron] Flagged ${warned350Users.length} users for 350-day warning`);

    // 3. WARN 300 DAYS: xpExpiresAt in 15–115 day window, not warned yet, not exempt
    const oneTwentyDaysFromNow = new Date(now.getTime() + 115 * 24 * 60 * 60 * 1000);

    const warned300Users = await prisma.user.findMany({
      where: {
        xpExpiresAt: {
          gte: fifteenDaysFromNow, // at least 15 days away
          lte: oneTwentyDaysFromNow, // no more than 115 days away
        },
        xpExpiryWarned300: false, // Not yet warned
        lifetimeXpEarned: {
          lt: 5000, // NOT exempt
        },
        guildXp: {
          gt: 0, // Only warn if they have XP
        },
      },
      select: { id: true },
    });

    for (const user of warned300Users) {
      await prisma.user.update({
        where: { id: user.id },
        data: { xpExpiryWarned300: true },
      });
    }

    console.log(`[xpExpiryCron] Flagged ${warned300Users.length} users for 300-day warning`);
    console.log(
      `[xpExpiryCron] Complete: ${expiredUsers.length} expired, ${warned350Users.length} warned@350d, ${warned300Users.length} warned@300d`
    );
  } catch (error) {
    console.error('[xpExpiryCron] Fatal error:', error);
  }
}

// Run daily at 02:00 UTC (= 21:00 ET, 22:00 CT, 00:00 PT)
// Format: minute hour day month dayOfWeek
// 0 2 * * * = every day at 2:00 AM UTC
cron.schedule('0 2 * * *', async () => {
  console.log('[xpExpiryCron] Starting XP expiry and warning batch...');
  await processXpExpiry();
});

console.log('[xpExpiryCron] Registered — runs daily at 02:00 UTC');
