/**
 * Guest weekend sales email (2026-11-26). Mounted in index.ts at /api/digest.
 *
 *   POST /api/digest/subscribe          { email, zip }  PUBLIC. Starts the double opt-in (one confirmation email).
 *                                        Same 200 response for new / existing / opted-out addresses.
 *   GET  /api/digest/confirm?token=     PUBLIC. Link in the confirmation email; turns the weekend email on.
 *   GET  /api/digest/unsubscribe?token= PUBLIC. Footer link in every weekend email.
 *   POST /api/digest/unsubscribe?token= PUBLIC. RFC 8058 one-click (mail clients POST to the header URL).
 *
 * Logic and storage notes: services/weekendDigestSignupService.ts. Sending: sendWeeklyDigest
 * (controllers/notificationController.ts), Fridays with Saturday/Sunday catch-up runs.
 */
import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { searchLimiter } from '../middleware/rateLimiter';
import { getVerifiedSessionUserId } from '../middleware/rateLimitShared';
import {
  PENDING_DIGEST_MESSAGE,
  confirmDigestSignup,
  requestDigestSignup,
  unsubscribeDigest,
} from '../services/weekendDigestSignupService';

const router = Router();
const SITE = process.env.FRONTEND_URL || 'https://finda.sale';

function sendPage(res: Response, title: string, body: string, status = 200): Response {
  return res
    .status(status)
    .type('html')
    .send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="robots" content="noindex"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:Arial,Helvetica,sans-serif;background:#fafaf9;color:#292524}
.card{max-width:440px;margin:16px;padding:32px 28px;background:#fff;border:1px solid #e7e5e4;border-radius:12px;text-align:center}
a{color:#b45309}h1{font-size:20px;margin:0 0 12px}p{margin:0 0 12px;line-height:1.5;color:#57534e}
@media (prefers-color-scheme:dark){body{background:#1c1917;color:#f5f5f4}.card{background:#292524;border-color:#44403c}p{color:#d6d3d1}a{color:#fbbf24}}</style></head>
<body><div class="card">${body}</div></body></html>`);
}

async function signedInEmail(req: Request): Promise<string | null> {
  try {
    const userId = getVerifiedSessionUserId(req);
    if (!userId) return null;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    return user?.email ? user.email.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

router.post('/subscribe', searchLimiter, async (req: Request, res: Response) => {
  try {
    const { email, zip } = (req.body || {}) as { email?: unknown; zip?: unknown };
    const result = await requestDigestSignup(email, zip, await signedInEmail(req));
    if (!result.ok) {
      const message =
        result.error === 'invalid_zip'
          ? 'Enter a 5-digit ZIP code.'
          : result.error === 'blocked_email'
            ? 'Please use a different email address.'
            : 'Enter a valid email address.';
      return res.status(400).json({ success: false, error: result.error, message });
    }
    if (result.status === 'subscribed') {
      return res.status(200).json({
        success: true,
        status: 'subscribed',
        message: "You're signed up. Your first weekend email comes this Friday.",
      });
    }
    return res.status(200).json({ success: true, status: 'pending_confirmation', message: PENDING_DIGEST_MESSAGE });
  } catch (err) {
    console.error('POST /api/digest/subscribe error:', err);
    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
});

router.get('/confirm', searchLimiter, async (req: Request, res: Response) => {
  try {
    const confirmed = await confirmDigestSignup(req.query.token);
    if (!confirmed) {
      return sendPage(
        res,
        'Link not valid',
        `<h1>This link is not valid</h1><p>The confirmation link may be incomplete or expired (links work for 7 days). Sign up again on <a href="${SITE}">FindA.Sale</a>.</p>`,
        400
      );
    }
    console.log('[weekendDigest] Guest signup confirmed');
    return sendPage(
      res,
      "You're signed up",
      `<h1>You're signed up</h1><p>Every Friday morning we'll email you the sales near ZIP code ${confirmed.zip}. Every email has a link to stop them.</p><p><a href="${SITE}/this-weekend">See this weekend's sales now</a></p>`
    );
  } catch (err) {
    console.error('GET /api/digest/confirm error:', err);
    return sendPage(res, 'Something went wrong', '<h1>Something went wrong</h1><p>Please try the link again in a moment.</p>', 500);
  }
});

router.get('/unsubscribe', searchLimiter, async (req: Request, res: Response) => {
  try {
    const ok = await unsubscribeDigest(req.query.token);
    if (!ok) {
      return sendPage(res, 'Link not valid', '<h1>This link is not valid</h1><p>The unsubscribe link may be incomplete.</p>', 400);
    }
    return sendPage(
      res,
      'Unsubscribed',
      `<h1>You are unsubscribed</h1><p>We won't send the weekend sales email to this address again.</p><p><a href="${SITE}">Back to FindA.Sale</a></p>`
    );
  } catch (err) {
    console.error('GET /api/digest/unsubscribe error:', err);
    return sendPage(res, 'Something went wrong', '<h1>Something went wrong</h1><p>Please try the link again in a moment.</p>', 500);
  }
});

router.post('/unsubscribe', searchLimiter, async (req: Request, res: Response) => {
  try {
    const ok = await unsubscribeDigest(req.query.token);
    if (!ok) return res.status(400).json({ message: 'Invalid token' });
    return res.status(200).json({ message: 'Unsubscribed' });
  } catch (err) {
    console.error('POST /api/digest/unsubscribe error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

export default router;
