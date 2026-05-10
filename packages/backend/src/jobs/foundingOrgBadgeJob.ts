/**
 * foundingOrgBadgeJob.ts — Feature #405: Founding Organizer Badge
 *
 * Runs nightly at 2 AM UTC. Awards `foundingOrgBadge = true` to the first 500
 * real organizers (non-unmanaged, ordered by createdAt). Idempotent — skips
 * entirely if all eligible organizers already have the badge.
 */

import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';

const FOUNDING_ORG_LIMIT = 500;

export function scheduleFoundingOrgBadgeCron() {
  // 0 2 * * * — 2 AM UTC daily
  cron.schedule('0 2 * * *', cronGuard({ jobName: 'foundingOrgBadgeJob' }, async () => {
    console.log('[FoundingOrgBadge] Starting nightly badge award check...');

    // Fast exit: if there are no eligible organizers without the badge, skip
    const pendingCount = await prisma.organizer.count({
      where: { foundingOrgBadge: false, isUnmanagedListing: false },
    });

    if (pendingCount === 0) {
      console.log('[FoundingOrgBadge] All eligible organizers already have the badge. Skipping.');
      return;
    }

    // Get the first 500 real organizers by signup date
    const earlyOrgs = await prisma.organizer.findMany({
      where: { isUnmanagedListing: false },
      orderBy: { createdAt: 'asc' },
      take: FOUNDING_ORG_LIMIT,
      select: { id: true, foundingOrgBadge: true },
    });

    const idsToAward = earlyOrgs
      .filter((o) => !o.foundingOrgBadge)
      .map((o) => o.id);

    if (idsToAward.length === 0) {
      console.log('[FoundingOrgBadge] First 500 organizers already awarded. Skipping.');
      return;
    }

    const result = await prisma.organizer.updateMany({
      where: { id: { in: idsToAward }, foundingOrgBadge: false },
      data: { foundingOrgBadge: true },
    });

    console.log(`[FoundingOrgBadge] Awarded to ${result.count} organizers.`);
  }));
}
