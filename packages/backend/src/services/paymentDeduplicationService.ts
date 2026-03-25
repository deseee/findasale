import { prisma } from '../lib/prisma';

/**
 * Platform Safety #102: Payment Method Deduplication
 * Detect if another user is sharing the same Stripe card fingerprint
 * Returns: { isDuplicate: boolean, otherUserIds: string[] }
 */
export const checkPaymentDuplicate = async (fingerprint: string, userId: string): Promise<{ isDuplicate: boolean; otherUserIds: string[] }> => {
  if (!fingerprint) {
    return { isDuplicate: false, otherUserIds: [] };
  }

  const otherUsers = await prisma.user.findMany({
    where: {
      stripeCardFingerprint: fingerprint,
      id: { not: userId } // Exclude the current user
    },
    select: { id: true }
  });

  const otherUserIds = otherUsers.map(u => u.id);

  if (otherUserIds.length > 0) {
    return { isDuplicate: true, otherUserIds };
  }

  return { isDuplicate: false, otherUserIds: [] };
};

/**
 * Store Stripe card fingerprint for a user
 */
export const storePaymentFingerprint = async (userId: string, fingerprint: string): Promise<void> => {
  await prisma.user.update({
    where: { id: userId },
    data: { stripeCardFingerprint: fingerprint }
  });
};

/**
 * Log payment deduplication warning for audit trail
 */
export const logPaymentDuplicateWarning = (userId: string, fingerprint: string, otherUserIds: string[]): void => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    event: 'PAYMENT_DUPLICATE_DETECTED',
    userId,
    cardFingerprint: fingerprint,
    otherUserIds,
    severity: 'WARNING'
  };

  console.warn('Platform Safety #102: Payment deduplication warning', logEntry);
};
