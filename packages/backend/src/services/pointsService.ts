import { prisma } from '../lib/prisma';

/**
 * Award points to a user and write a PointsTransaction record.
 * Fire-and-forget safe — caller should .catch() if not awaiting.
 */
export const awardPoints = async (
  userId: string,
  type: string,
  points: number,
  saleId?: string,
  itemId?: string,
  description?: string,
): Promise<void> => {
  await prisma.$transaction([
    prisma.pointsTransaction.create({
      data: { userId, type, points, saleId: saleId ?? null, itemId: itemId ?? null, description: description ?? null },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { points: { increment: points } },
    }),
  ]);
};

/** Returns tier label based on point total. */
export const getTier = (points: number): string => {
  if (points >= 500) return 'Estate Pro';
  if (points >= 100) return 'Hunter';
  return 'Scout';
};
