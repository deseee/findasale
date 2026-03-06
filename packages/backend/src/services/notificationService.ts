import { prisma } from '../lib/prisma';

/**
 * Creates a notification record and stores it in the inbox.
 * Fire-and-forget: callers should wrap this in .catch() for error handling.
 */
export async function createNotification(
  userId: string,
  type: string,
  title: string,
  body: string,
  link?: string
): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        body,
        link,
      },
    });
  } catch (err) {
    console.error('[notification] Failed to create notification:', err);
    throw err;
  }
}
