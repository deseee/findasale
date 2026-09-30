/**
 * Unfollow an organizer everywhere (2026-09-29).
 *
 * Follow is the canonical table, but legacy SmartFollow rows are still honoured and
 * smartFollowService.getUserFollows copies any SmartFollow row back into Follow on read. Deleting only
 * the Follow row therefore let the follow resurrect itself. Both rows are removed in ONE transaction so
 * neither can survive without the other.
 */
import { prisma } from '../lib/prisma';

export async function unfollowOrganizerEverywhere(userId: string, organizerId: string): Promise<void> {
  await prisma.$transaction([
    prisma.follow.deleteMany({ where: { userId, organizerId } }),
    prisma.smartFollow.deleteMany({ where: { userId, organizerId } }),
  ]);
}
