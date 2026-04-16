/**
 * Tier Grace Period Service
 * Manages graceful downgrade workflows: calculating impacts, triggering grace periods,
 * finalizing locks, and restoring access on re-upgrade.
 */

import { PrismaClient } from '@prisma/client';
import { TIER_LIMITS } from '../constants/tierLimits';

const prisma = new PrismaClient();

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
 * Finalize grace period: lock items over limit and hide team members
 * Called when grace period expires (cron job)
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

  const limits = TIER_LIMITS['SIMPLE'];
  const allItems = organizer.sales.flatMap(s => s.items);

  // Sort items by createdAt DESC (newest first), lock the oldest ones
  const sortedItems = allItems.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const itemsToLock = sortedItems.slice(limits.itemsPerSale);

  // Lock items over SIMPLE tier limit
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

  // Hide team members (set graceRemovedAt)
  if (organizer.workspace?.members) {
    const memberIds = organizer.workspace.members.map(m => m.id);
    if (memberIds.length > 0) {
      await prisma.workspaceMember.updateMany({
        where: { id: { in: memberIds } },
        data: { graceRemovedAt: new Date() }
      });
    }
  }

  // Clear grace period on organizer
  await prisma.organizer.update({
    where: { id: organizerId },
    data: {
      graceEndAt: null,
      graceTierBefore: null
    }
  });
}

/**
 * Clear grace period and restore all locked items
 * Called when organizer re-upgrades within 30 days
 */
export async function clearGracePeriod(organizerId: string) {
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

  // Restore team members
  if (organizer.workspace?.members) {
    const memberIds = organizer.workspace.members.map(m => m.id);
    if (memberIds.length > 0) {
      await prisma.workspaceMember.updateMany({
        where: { id: { in: memberIds } },
        data: {
          graceRemovedAt: null,
          accessRestored: true
        }
      });
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
