/**
 * Tier Grace Period Service
 * Manages graceful downgrade workflows: calculating impacts, triggering grace periods,
 * finalizing locks, and restoring access on re-upgrade.
 */

import { TIER_LIMITS } from '../constants/tierLimits';
import { prisma } from '../lib/prisma';
import { createNotification } from '../lib/notificationService'; // S1195 sweep continuation (2026-08-08): finalizeGracePeriod notification-gap fix
import { notifyAutoMarkdownsPaused } from '../lib/syncTier'; // 2026-09-29: one-time "auto-markdown cycles paused" notice when a scheduled cancellation ends

// Uses shared Prisma singleton (avoids a second connection pool — S1013 perf fix)


/**
 * Calculate what items/features will be hidden when downgrading to a new tier
 */
export async function calculateDowngradeDelta(organizerId: string, newTier: string) {
  const organizer = await prisma.organizer.findUnique({
    where: { id: organizerId },
    include: {
      sales: {
        include: {
          items: { where: { status: { notIn: ['SOLD', 'DONATED'] } } }
        }
      },
      workspace: { include: { members: true } }
    }
  });

  if (!organizer) throw new Error('Organizer not found');

  const limits = TIER_LIMITS[newTier as keyof typeof TIER_LIMITS];
  if (!limits) throw new Error('Invalid tier');

  const allItems = organizer.sales.flatMap(s => s.items);
  const itemsHidden = Math.max(0, allItems.length - limits.itemsPerSale);
  const photosAffected = allItems.filter(i => (i as any).photoUrls?.length > limits.photosPerItem).length;
  const teamMembersLosing = newTier !== 'TEAMS' ? (organizer.workspace?.members?.length || 0) : 0;

  return {
    itemsHidden,
    photosAffected,
    teamMembersLosing,
    totalItems: allItems.length
  };
}

/**
 * Start a grace period when organizer downgrades
 * Sets graceEndAt to 7 days from now
 */
export async function triggerGracePeriod(organizerId: string, previousTier: string) {
  const graceEndAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.organizer.update({
    where: { id: organizerId },
    data: {
      graceEndAt,
      graceTierBefore: previousTier,
      graceNotificationsCount: 0
    }
  });

  return graceEndAt;
}

/**
 * Finalize grace period: lock items over the organizer's CURRENT tier limit and remove staff
 * access, but only when the organizer has really lost what they are being locked out of.
 * Called when a grace period expires (cron job).
 *
 * 2026-09-29 (Patrick D2, PRO/TEAMS features stay available until the subscription actually
 * runs out): this function never changes the tier, and it used to act as if the organizer was
 * already on SIMPLE. It set graceRemovedAt on every workspace member (a column the staff
 * resolver in utils/actingOrganizer.ts now reads) even while the owner was still paying for
 * TEAMS, and it locked items against the SIMPLE limit. It now reads the organizer's tier at
 * the moment it runs:
 *   - items are locked only past the limit of the tier the organizer is on right now (a paid
 *     tier has no item cap, and SIMPLE's cap is MAX_SAFE_INTEGER since 2026-09-24, so in
 *     practice nothing is locked; the machinery stays in place, dormant);
 *   - staff access is removed only when the owner is no longer on TEAMS. An owner still on
 *     TEAMS keeps every staff member and the run is a no-op apart from clearing the grace
 *     markers (so the cron does not retry the same organizer every night).
 */
export async function finalizeGracePeriod(organizerId: string) {
  const organizer = await prisma.organizer.findUnique({
    where: { id: organizerId },
    include: {
      sales: { include: { items: true } },
      workspace: { include: { members: true } }
    }
  });

  if (!organizer) return;

  const currentTier = ((organizer as any).subscriptionTier as string) || 'SIMPLE';
  const limits = TIER_LIMITS[currentTier as keyof typeof TIER_LIMITS] ?? TIER_LIMITS['SIMPLE'];
  const ownerStillOnTeams = currentTier === 'TEAMS';
  const allItems = organizer.sales.flatMap(s => s.items);

  // Sort items by createdAt DESC (newest first), lock the oldest ones
  const sortedItems = allItems.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const itemsToLock = sortedItems.slice(limits.itemsPerSale);

  // Lock items over the current tier's limit
  if (itemsToLock.length > 0) {
    await prisma.item.updateMany({
      where: { id: { in: itemsToLock.map(i => i.id) } },
      data: {
        status: 'GRACE_LOCKED',
        graceLockedAt: new Date(),
        graceLockedReason: 'items_over_limit'
      }
    });
  }

  // Remove staff access (set graceRemovedAt) only when the owner is no longer on TEAMS.
  // Members already removed keep their original timestamp.
  const allMembers = organizer.workspace?.members ?? [];
  const membersToRemove = ownerStillOnTeams
    ? []
    : allMembers.filter(m => !(m as any).graceRemovedAt);
  if (ownerStillOnTeams && allMembers.length > 0) {
    console.log(`[tierGraceService] Organizer ${organizerId} is still on TEAMS at grace end -- leaving ${allMembers.length} staff member(s) in place.`);
  }
  if (membersToRemove.length > 0) {
    await prisma.workspaceMember.updateMany({
      where: { id: { in: membersToRemove.map(m => m.id) } },
      data: { graceRemovedAt: new Date() }
    });
  }

  // Clear grace period on organizer
  await prisma.organizer.update({
    where: { id: organizerId },
    data: {
      graceEndAt: null,
      graceTierBefore: null
    }
  });

  // Notification-gap fix (S1195 sweep continuation, 2026-08-08): this function is the
  // "real-event execution" counterpart to the grace period's initial trigger --
  // triggerGracePeriod() above fires from confirmDowngrade() (billingController.ts),
  // a direct user action that already gets an immediate API response. finalizeGracePeriod()
  // runs a week later from tierGraceCronJob.ts with NO user interaction at all, so an
  // organizer who ignored their downgrade would otherwise find items or staff locked with no
  // record of why. sendEmail: true because this is a real, immediate loss of access. Only
  // sent when something was actually locked or removed.
  if (itemsToLock.length > 0 || membersToRemove.length > 0) {
    const memberCount = membersToRemove.length;
    const parts: string[] = [];
    if (itemsToLock.length > 0) {
      parts.push(`${itemsToLock.length} item${itemsToLock.length === 1 ? '' : 's'} over your plan's limit ${itemsToLock.length === 1 ? 'has' : 'have'} been hidden from your storefront`);
    }
    if (memberCount > 0) {
      parts.push(`${memberCount} team member${memberCount === 1 ? '' : 's'} lost access`);
    }
    createNotification({
      userId: organizer.userId,
      type: 'grace_period_finalized',
      title: 'Your grace period ended: some items and access were locked',
      body: `Your 7-day grace period after your downgrade has ended. ${parts.join(' and ')}. Upgrade again at any time and they are restored automatically.`,
      link: '/organizer/subscription',
      channel: 'OPERATIONAL',
      sendEmail: true,
    }).catch((err: unknown) => {
      console.error(`[tierGraceService] Failed to send grace_period_finalized notification for organizer ${organizerId}:`, err);
    });
  }

  return { itemsLocked: itemsToLock.length, staffRemoved: membersToRemove.length };
}

/**
 * Clear grace period and restore anything the grace machinery locked.
 * Called when an organizer re-subscribes or upgrades (Stripe webhook for legacy subscribers,
 * createSquareBillingSubscription for Square).
 *
 * `restoredTier` (2026-09-29): the tier the organizer just moved to. Locked items are restored
 * for any tier (no paid tier has an item cap). Staff access is only restored when the tier is
 * TEAMS, because staff access requires the owner to be on TEAMS (D6). Omitting it keeps the
 * previous behavior (restore everything), which the legacy Stripe webhook callers rely on.
 * Only members that were actually removed (graceRemovedAt set) are touched, so accessRestored
 * is no longer flipped to true for staff who never lost access.
 */
export async function clearGracePeriod(organizerId: string, restoredTier?: string) {
  // Restore all GRACE_LOCKED items to AVAILABLE
  const organizer = await prisma.organizer.findUnique({
    where: { id: organizerId },
    include: {
      sales: {
        include: {
          items: { where: { status: 'GRACE_LOCKED' } }
        }
      },
      workspace: { include: { members: true } }
    }
  });

  if (!organizer) return;

  // Restore items
  const lockedItemIds = organizer.sales.flatMap(s => s.items).map(i => i.id);
  if (lockedItemIds.length > 0) {
    await prisma.item.updateMany({
      where: { id: { in: lockedItemIds } },
      data: {
        status: 'AVAILABLE',
        graceLockedAt: null,
        graceLockedReason: null
      }
    });
  }

  // Restore team members that were removed, when the new tier allows staff
  let membersRestored = 0;
  const tierAllowsStaff = restoredTier === undefined || restoredTier === 'TEAMS';
  if (tierAllowsStaff && organizer.workspace?.members) {
    const removedMemberIds = organizer.workspace.members
      .filter(m => !!(m as any).graceRemovedAt)
      .map(m => m.id);
    if (removedMemberIds.length > 0) {
      const result = await prisma.workspaceMember.updateMany({
        where: { id: { in: removedMemberIds } },
        data: {
          graceRemovedAt: null,
          accessRestored: true
        }
      });
      membersRestored = result?.count ?? removedMemberIds.length;
    }
  }

  // Clear grace period on organizer
  await prisma.organizer.update({
    where: { id: organizerId },
    data: {
      graceEndAt: null,
      graceTierBefore: null,
      graceNotificationsCount: 0
    }
  });

  return { itemsRestored: lockedItemIds.length, membersRestored };
}

/**
 * Get grace period status for an organizer
 */
export async function getGraceStatus(organizerId: string) {
  const organizer = await prisma.organizer.findUnique({
    where: { id: organizerId },
    include: {
      sales: { include: { items: { where: { status: 'GRACE_LOCKED' } } } }
    }
  });

  if (!organizer || !organizer.graceEndAt) return null;

  const now = new Date();
  const daysRemaining = Math.ceil(
    (organizer.graceEndAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
  const itemsLocked = organizer.sales.flatMap(s => s.items).length;

  return {
    daysRemaining: Math.max(0, daysRemaining),
    itemsLocked,
    graceEndAt: organizer.graceEndAt,
    graceTierBefore: organizer.graceTierBefore,
    isExpired: now > organizer.graceEndAt,
    notificationsSent: organizer.graceNotificationsCount
  };
}

/**
 * Increment grace notification count
 */
export async function incrementGraceNotification(organizerId: string) {
  await prisma.organizer.update({
    where: { id: organizerId },
    data: { graceNotificationsCount: { increment: 1 } }
  });
}

/**
 * End-of-period downgrade for organizers who scheduled a cancellation WITHOUT a Square
 * billing schedule (2026-09-29, billing/cancel DB-only path).
 *
 * jobs/squareBillingChargeJob.ts already downgrades Square-billed organizers who are
 * 'scheduled_for_cancellation' once billingCurrentPeriodEnd passes. An organizer still on the
 * old, frozen Stripe subscription (billingProcessor null/'stripe') never appears in that scan,
 * and Stripe's platform account is closed, so no webhook will ever end their plan. This pass
 * does the same thing for them, straight from the DB with no Stripe call: once the scheduled
 * period end (billingCurrentPeriodEnd, written by billingController.cancelSubscription) has
 * passed, drop PRO/TEAMS to SIMPLE using the same fields downgradeOrganizerToSimple writes.
 *
 * Patrick D1: nothing about MarkdownCycle rows or discounted prices is touched (paid
 * automation just pauses, one notice via notifyAutoMarkdownsPaused). D2: the plan stays
 * active until the period end passes. D6: staff access ends with TEAMS through the dynamic
 * check in utils/actingOrganizer.ts, so no member rows are changed here.
 *
 * Race guard: the downgrade is a CONDITIONAL updateMany (status must still be
 * 'scheduled_for_cancellation' and the period end still due), so an organizer who undid the
 * cancellation or re-subscribed after the scan but before their turn is never downgraded.
 */
export async function downgradeScheduledCancelFrozenOrganizers(now: Date = new Date()) {
  const due = await prisma.organizer.findMany({
    where: {
      subscriptionStatus: 'scheduled_for_cancellation',
      subscriptionTier: { in: ['PRO', 'TEAMS'] },
      billingCurrentPeriodEnd: { lte: now },
      OR: [{ billingProcessor: null }, { billingProcessor: { not: 'square' } }],
    },
    select: { id: true, userId: true, subscriptionTier: true },
  });

  let downgraded = 0;
  for (const org of due) {
    try {
      const result = await prisma.organizer.updateMany({
        where: {
          id: org.id,
          subscriptionStatus: 'scheduled_for_cancellation',
          subscriptionTier: { in: ['PRO', 'TEAMS'] },
          billingCurrentPeriodEnd: { lte: now },
        },
        data: {
          subscriptionTier: 'SIMPLE',
          subscriptionStatus: 'canceled',
          billingCurrentPeriodEnd: null,
          billingDunningFailCount: 0,
          billingNextRetryAt: null,
          billingGraceEndsAt: null,
          billingLastFailureReason: null,
          tokenVersion: { increment: 1 }, // real tier change: invalidate any stale tier claim in a live JWT
        },
      });
      if (result.count !== 1) continue;
      downgraded++;

      if (org.userId) {
        await prisma.userRoleSubscription.updateMany({
          where: { userId: org.userId, role: 'ORGANIZER' },
          data: { subscriptionTier: 'SIMPLE', subscriptionStatus: null, tierLapsedAt: now },
        });
        await createNotification({
          userId: org.userId,
          type: 'subscription_cancellation_completed',
          title: 'Your FindA.Sale plan has ended',
          body:
            `Your ${org.subscriptionTier} plan ended as you scheduled, and your account is now on the free plan. ` +
            `Your sales, items and settings are unchanged, and the free features keep working. ` +
            `Paid automation such as automatic markdown cycles is paused until you subscribe again.`,
          link: '/organizer/subscription',
          channel: 'OPERATIONAL',
          sendEmail: true,
        }).catch((err: unknown) => {
          console.error(`[tierGraceService] Failed to send cancellation-completed notice for organizer ${org.id}:`, err);
        });
      }

      // Best-effort: swallows all errors, only sends when the organizer has an active cycle.
      await notifyAutoMarkdownsPaused(org.id);
    } catch (err) {
      console.error(`[tierGraceService] Failed to finish scheduled cancellation for organizer ${org.id}:`, err);
    }
  }
  return { checked: due.length, downgraded };
}
