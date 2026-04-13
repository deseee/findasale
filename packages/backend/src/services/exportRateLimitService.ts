import { Response } from 'express';

/**
 * Platform Safety #99: Check if user has already exported this calendar month
 * Returns: { allowed: boolean, nextExportDate?: Date, errorResponse?: Response call }
 */
export const checkExportRateLimit = async (userId: string, lastExportAt: Date | null): Promise<{ allowed: boolean; nextExportDate?: Date }> => {
  if (!lastExportAt) {
    // Never exported before — allow
    return { allowed: true };
  }

  const lastExportDate = new Date(lastExportAt);
  const now = new Date();

  // Check if last export was in the current calendar month
  const lastMonth = lastExportDate.getUTCMonth();
  const lastYear = lastExportDate.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  const currentYear = now.getUTCFullYear();

  if (lastYear === currentYear && lastMonth === currentMonth) {
    // Exported this month — deny
    // Calculate first day of next month
    const nextExportDate = new Date(Date.UTC(currentYear, currentMonth + 1, 1));
    return { allowed: false, nextExportDate };
  }

  // Different month — allow
  return { allowed: true };
};

/**
 * Format next export date for user message
 */
export const formatNextExportDate = (date: Date): string => {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};
