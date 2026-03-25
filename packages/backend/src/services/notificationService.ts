import { prisma } from '../lib/prisma';

/**
 * Creates a notification record and stores it in the inbox.
 * Fire-and-forget: fails silently on error (Feature #109: graceful degradation).
 * Does not throw — prevents notification failures from crashing the process.
 */
export async function createNotification(
  userId: string,
  type: string,
  title: string,
  body: string,
  link?: string,
  channel?: string
): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        body,
        link,
        channel: channel || 'OPERATIONAL',
      },
    });
  } catch (err) {
    // Feature #109: Graceful degradation — log but don't throw
    // Notification failures should not crash the application
    console.warn('[notification] Failed to create notification:', err instanceof Error ? err.message : err);
  }
}