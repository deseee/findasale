import { prisma } from '../lib/prisma';

/**
 * Platform Safety #100: First-Month Refund Cap (50%)
 * If requester account is < 30 days old, cap refund amount at 50% of original
 */
export const applyFirstMonthRefundCap = async (userId: string, originalAmount: number): Promise<{ cappedAmount: number; wasCapped: boolean }> => {
  // Get user account creation date
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true }
  });

  if (!user) {
    throw new Error('User not found');
  }

  const now = new Date();
  const accountAgeMs = now.getTime() - new Date(user.createdAt).getTime();
  const accountAgeDays = accountAgeMs / (1000 * 60 * 60 * 24);

  // Account is < 30 days old — apply 50% cap
  if (accountAgeDays < 30) {
    const cappedAmount = Math.floor(originalAmount * 0.5);
    return {
      cappedAmount,
      wasCapped: true
    };
  }

  // Account is >= 30 days old — no cap
  return {
    cappedAmount: originalAmount,
    wasCapped: false
  };
};

/**
 * Log refund processing with cap information
 */
export const logRefundProcessing = async (disputeId: string, userId: string, originalAmount: number, processedAmount: number, wasCapped: boolean): Promise<void> => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    disputeId,
    userId,
    originalAmount,
    processedAmount,
    wasCapped,
    cappedReason: wasCapped ? 'Platform Safety #100: First-month refund cap (50%)' : null
  };

  console.log('Refund processing:', logEntry);

  // Optionally: persist to database if a RefundLog model exists
  // For now, logging to console for audit trail
};
