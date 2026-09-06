import { Request, Response } from 'express';
import crypto from 'crypto';
// Same singleton as '../index' (index.ts:291 re-exports './lib/prisma'), but importing it
// from '../index' drags in the Express entry point -- which process.exit(1)s at
// index.ts:47 when JWT_SECRET is unset. notificationController.sendWeeklyDigest
// dynamic-imports this file, so that killed the weeklyDigest e2e jest worker.
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { suppressionService } from '../services/suppressionService';

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
  // Added 2026-09-05 (saleEndingSoonJob per-recipient unsubscribe fix): no existing
  // key covers "this specific followed sale is about to end" -- newSales is for a new
  // sale from a followed ORGANIZER, priceDrops/flash/weekly are unrelated categories.
  saleEndingSoon: 'emailSaleEndingSoon',
  // Added 2026-09-06 (Gmail-bulk-mail content audit fix): priceDropService.ts's own gate
  // (priceAlertsEnabledFor) reads notificationPrefs.priceAlerts -- NOT emailPriceDropAlerts
  // (the field the pre-existing 'priceDrops' type above flips). A price-drop unsubscribe
  // link built with type 'priceDrops' would report success but never actually stop the
  // emails, since nothing reads that field. This new type targets the field the sender
  // actually checks. The 'priceDrops'/emailPriceDropAlerts mapping is left as-is (unknown
  // whether anything else depends on it) but appears to be dead for this purpose.
  priceAlerts: 'priceAlerts',
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
  saleEndingSoon: 'sale ending soon alerts',
  priceAlerts: 'price drop alerts',
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

  // Create new token. Explicit crypto.randomBytes hex value -- NOT the Prisma schema's
  // cuid() default. cuid() is an ID-generation scheme (timestamp + monotonic counter +
  // machine fingerprint + a short random suffix) designed for collision-resistant
  // primary/foreign keys, not as a bearer/capability secret -- the counter and
  // fingerprint components are not secret and narrow the guessable space. Every other
  // single-use security token in this codebase (password reset: routes/auth.ts,
  // email verification: authController.ts, OAuth state/nonce, webhook secrets,
  // tracking tokens) uses crypto.randomBytes(N).toString('hex'). This token is the
  // SOLE authentication for handleUnsubscribe (no password, no session) so it should
  // meet the same bar. Findasale-hacker security pass, 2026-09-05.
  const token = await prisma.unsubscribeToken.create({
    data: {
      userId,
      type,
      token: crypto.randomBytes(32).toString('hex'),
    },
  });

  return token.token;
}

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://finda.sale';

/**
 * Build both unsubscribe links for a user + notification type, reusing the
 * existing UnsubscribeToken scheme above (generateUnsubscribeToken) instead of
 * inventing a second token format.
 *
 * - webUrl: the human-facing rendered frontend page (pages/unsubscribe.tsx) --
 *   safe to put in visible email body copy ("Unsubscribe" link in the footer).
 * - listUnsubscribeHeader: RFC 8058 header value. Points at the BACKEND route
 *   directly (via Vercel's /api/:path* -> Railway fallback proxy in
 *   next.config.js, so finda.sale/api/unsubscribe resolves without a second
 *   domain) so a mail client's automated one-click POST completes with no page
 *   render, no auth and no JS -- the exact thing the old default
 *   (`${FRONTEND_URL}/settings/notifications`, a plain frontend page with zero
 *   server-side POST handling) could never do.
 *
 * Falls back to a mailto-only header + the generic settings page if token
 * generation fails, rather than silently reusing the broken default.
 */
export async function buildUnsubscribeLinks(
  userId: string,
  type: string
): Promise<{ webUrl: string; listUnsubscribeHeader: string }> {
  try {
    const token = await generateUnsubscribeToken(userId, type);
    return {
      webUrl: `${FRONTEND_URL}/unsubscribe?token=${token}`,
      listUnsubscribeHeader: `<mailto:unsubscribe@finda.sale?subject=unsubscribe>, <${FRONTEND_URL}/api/unsubscribe?token=${token}>`,
    };
  } catch (err) {
    console.error('[unsubscribeController] Failed to generate unsubscribe token for', userId, type, err);
    return {
      webUrl: `${FRONTEND_URL}/settings/notifications`,
      listUnsubscribeHeader: `<mailto:unsubscribe@finda.sale?subject=unsubscribe>`,
    };
  }
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

    // Handle "all" type: disable all notification preferences AND add a general
    // opt-out suppression record. The notificationPrefs flip alone only ever
    // affected the one sender that reads it (weeklyDigest) -- every other bulk/
    // marketing sender (winBack, wishlist alerts, curator digest, buyer match,
    // collector passport, monthly trend report, etc.) gates on
    // suppressionService.isSuppressed(), which only processOptOut() sets. Without
    // this, clicking "unsubscribe from all" looked successful but left every one
    // of those senders unaffected.
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
            emailSaleEndingSoon: false,
          },
        },
      });
      await suppressionService.processOptOut(user.email);
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

    // Handle "all" type: enable all notification preferences AND clear the
    // general opt-out suppression set by handleUnsubscribe's type='all' path
    // (see processOptOut there) -- otherwise a resubscribed user stays
    // permanently suppressed from every marketing sender that gates on
    // suppressionService.isSuppressed() despite their prefs now reading true.
    // Only the opted-out flag is cleared -- a real hard-bounce/complaint
    // suppression is never undone by a user action.
    if (type === 'all') {
      const userForResub = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      await prisma.user.update({
        where: { id: userId },
        data: {
          notificationPrefs: {
            emailWeeklyDigest: true,
            emailFlashDeals: true,
            emailNewSalesFromFollowed: true,
            emailPriceDropAlerts: true,
            pushMessages: true,
            emailSaleEndingSoon: true,
          },
        },
      });
      if (userForResub?.email) {
        await suppressionService.clearOptOut(userForResub.email);
      }
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
