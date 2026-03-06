import { Request, Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';

/**
 * Unsubscribe type to notification preference field mapping.
 * Maps unsubscribe token types to the notificationPrefs JSON field keys.
 */
const TYPE_TO_PREF_MAP: Record<string, string> = {
  all: 'all',
  weekly: 'emailWeeklyDigest',
  flash: 'emailFlashDeals',
  newSales: 'emailNewSalesFromFollowed',
  priceDrops: 'emailPriceDropAlerts',
  messages: 'pushMessages',
};

/**
 * Type to human-readable label mapping for email templates and responses.
 */
const TYPE_TO_LABEL_MAP: Record<string, string> = {
  all: 'all FindA.Sale emails',
  weekly: 'weekly digest',
  flash: 'flash deal alerts',
  newSales: 'new sale alerts',
  priceDrops: 'price drop alerts',
  messages: 'message notifications',
};

/**
 * Generate or retrieve an unsubscribe token for a specific user and type.
 * Used by email services to include unsubscribe links in emails.
 *
 * @param userId - The user ID
 * @param type - The unsubscribe type (all, weekly, flash, newSales, priceDrops, messages)
 * @returns The unsubscribe token string
 */
export async function generateUnsubscribeToken(
  userId: string,
  type: string
): Promise<string> {
  // Check if token already exists for this user+type combination
  const existingToken = await prisma.unsubscribeToken.findFirst({
    where: {
      userId,
      type,
    },
  });

  if (existingToken) {
    return existingToken.token;
  }

  // Create new token
  const token = await prisma.unsubscribeToken.create({
    data: {
      userId,
      type,
    },
  });

  return token.token;
}

/**
 * Handle unsubscribe request via token link.
 * GET /unsubscribe?token=xxx
 *
 * Validates the token, applies the preference change, and returns success.
 * No authentication required - token itself is the auth mechanism.
 */
export async function handleUnsubscribe(
  req: Request,
  res: Response
): Promise<Response> {
  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Token is required',
      });
    }

    // Look up the token
    const unsubToken = await prisma.unsubscribeToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!unsubToken) {
      return res.status(404).json({
        success: false,
        message: 'This unsubscribe link is invalid or has already been used.',
      });
    }

    const user = unsubToken.user;
    const type = unsubToken.type;

    // Handle "all" type: disable all notification preferences
    if (type === 'all') {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          notificationPrefs: {
            emailWeeklyDigest: false,
            emailFlashDeals: false,
            emailNewSalesFromFollowed: false,
            emailPriceDropAlerts: false,
            pushMessages: false,
          },
        },
      });
    } else {
      // Handle type-specific unsubscribe
      const prefKey = TYPE_TO_PREF_MAP[type];
      if (!prefKey) {
        return res.status(400).json({
          success: false,
          message: 'Invalid unsubscribe type',
        });
      }

      const currentPrefs = (user.notificationPrefs as Record<string, any>) || {};
      const updatedPrefs = {
        ...currentPrefs,
        [prefKey]: false,
      };

      await prisma.user.update({
        where: { id: user.id },
        data: {
          notificationPrefs: updatedPrefs,
        },
      });
    }

    // Delete the token (one-time use)
    await prisma.unsubscribeToken.delete({
      where: { token },
    });

    const label = TYPE_TO_LABEL_MAP[type] || type;

    return res.json({
      success: true,
      type,
      label,
      email: user.email,
      message: `You've been unsubscribed from ${label}.`,
    });
  } catch (error) {
    console.error('Error handling unsubscribe:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while processing your request.',
    });
  }
}

/**
 * Re-subscribe to a specific notification type.
 * POST /unsubscribe/resubscribe
 *
 * Requires authentication. Takes { type } in body.
 */
export async function resubscribe(
  req: AuthRequest,
  res: Response
): Promise<Response> {
  try {
    const userId = req.user?.id;
    const { type } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    if (!type || typeof type !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Type is required',
      });
    }

    const prefKey = TYPE_TO_PREF_MAP[type];
    if (!prefKey) {
      return res.status(400).json({
        success: false,
        message: 'Invalid unsubscribe type',
      });
    }

    // Handle "all" type: enable all notification preferences
    if (type === 'all') {
      await prisma.user.update({
        where: { id: userId },
        data: {
          notificationPrefs: {
            emailWeeklyDigest: true,
            emailFlashDeals: true,
            emailNewSalesFromFollowed: true,
            emailPriceDropAlerts: true,
            pushMessages: true,
          },
        },
      });
    } else {
      // Handle type-specific re-subscribe
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      const currentPrefs = (user.notificationPrefs as Record<string, any>) || {};
      const updatedPrefs = {
        ...currentPrefs,
        [prefKey]: true,
      };

      await prisma.user.update({
        where: { id: userId },
        data: {
          notificationPrefs: updatedPrefs,
        },
      });
    }

    const label = TYPE_TO_LABEL_MAP[type] || type;

    return res.json({
      success: true,
      type,
      label,
      message: `You've been re-subscribed to ${label}.`,
    });
  } catch (error) {
    console.error('Error handling resubscribe:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while processing your request.',
    });
  }
}
