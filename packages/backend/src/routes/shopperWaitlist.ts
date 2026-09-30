/**
 * Shopper Notify Me Waitlist — Feature #455
 *
 * Routes:
 *   POST   /api/shopper/waitlist        — create a waitlist entry
 *   GET    /api/shopper/waitlist        — list user's active entries
 *   DELETE /api/shopper/waitlist/:id   — soft-delete (set isActive: false)
 *   GET    /api/shopper/waitlist/unsubscribe?token=  — PUBLIC one-click unsubscribe used by the link
 *                                        in Notify Me emails (stateless HMAC token, works for anonymous
 *                                        /search/notify subscribers too)
 *   POST   /api/shopper/waitlist/unsubscribe?token=  — PUBLIC RFC 8058 one-click unsubscribe (mail
 *                                        clients POST "List-Unsubscribe=One-Click" to the header URL)
 *   GET    /api/shopper/waitlist/confirm?token=      — PUBLIC double opt-in confirmation for anonymous
 *                                        /search/notify alerts (HMAC token, purpose "notify-confirm")
 *
 * Mounted in index.ts at /api/shopper/waitlist. The sender is services/notifyMeSenderService.ts,
 * scheduled by jobs/notifyMeSenderJob.ts (off unless NOTIFY_ME_SENDER_ENABLED=true).
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { searchLimiter } from '../middleware/rateLimiter';
import { unsubscribeNotifyMeEmail, verifyNotifyMeToken, confirmNotifyMeEmail, verifyNotifyConfirmToken } from '../services/notifyMeSenderService';

// Guard against a runaway client: a shopper can hold this many active alerts at once.
const MAX_ACTIVE_ENTRIES_PER_USER = 25;

const router = Router();

const createSchema = z.object({
  itemType: z.string().min(2).max(200).transform((s) => s.toLowerCase().trim().replace(/\s+/g, ' ')),
  city: z.string().max(100).optional(),
  state: z.string().max(50).optional(),
});

// POST /api/shopper/waitlist
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Validation error', errors: parsed.error.errors });
    }

    const { itemType, city, state } = parsed.data;

    // Prevent duplicate active entries for the same itemType+city combo
    const existing = await prisma.shopperWaitlistEntry.findFirst({
      where: { userId, itemType, city: city ?? null, isActive: true },
    });

    if (existing) {
      if (existing.notifiedAt) {
        // The one-shot alert already fired. Re-arm it so the shopper is told about the next match
        // (updatedAt moves forward, so only items listed after this moment count as new).
        // armedAt (written only here and at create) is what the sender matches against; updatedAt is also
        // bumped by the sender's own claim/release, which used to lose matches on a retry.
        const rearmed = await prisma.shopperWaitlistEntry.update({
          where: { id: existing.id },
          data: { notifiedAt: null, armedAt: new Date() },
        });
        return res.status(200).json({ ...rearmed, rearmed: true });
      }
      return res.status(409).json({ message: 'Already on waitlist for this item type and location', entry: existing });
    }

    const activeCount = await prisma.shopperWaitlistEntry.count({ where: { userId, isActive: true } });
    if (activeCount >= MAX_ACTIVE_ENTRIES_PER_USER) {
      return res.status(400).json({
        message: `You can have up to ${MAX_ACTIVE_ENTRIES_PER_USER} active alerts. Remove one to add another.`,
      });
    }

    const entry = await prisma.shopperWaitlistEntry.create({
      data: { userId, itemType, city: city ?? null, state: state ?? null, armedAt: new Date() },
    });

    return res.status(201).json(entry);
  } catch (err) {
    console.error('POST /api/shopper/waitlist error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/shopper/waitlist
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const entries = await prisma.shopperWaitlistEntry.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    return res.json(entries);
  } catch (err) {
    console.error('GET /api/shopper/waitlist error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/shopper/waitlist/:id  (soft-delete)
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { id } = req.params;

    const entry = await prisma.shopperWaitlistEntry.findFirst({
      where: { id, userId },
    });

    if (!entry) {
      return res.status(404).json({ message: 'Waitlist entry not found' });
    }

    await prisma.shopperWaitlistEntry.update({
      where: { id },
      data: { isActive: false },
    });

    return res.json({ message: 'Removed from waitlist' });
  } catch (err) {
    console.error('DELETE /api/shopper/waitlist error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Small self-contained HTML page (light + dark) so public email links work straight from an email
// client with no frontend page.
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

// GET /api/shopper/waitlist/unsubscribe?token=...  (PUBLIC, no auth)
// Linked from every Notify Me email. Deactivates ALL Notify Me alerts for the token's email
// (anonymous search alerts and logged-in waitlist entries). Responds with a small self-contained
// HTML page (light + dark) so it works straight from an email client with no frontend page.
router.get('/unsubscribe', searchLimiter, async (req: Request, res: Response) => {
  const page = (title: string, body: string, status = 200) => sendPage(res, title, body, status);

  try {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const email = token ? verifyNotifyMeToken(token) : null;
    if (!email) {
      return page(
        'Link not valid',
        '<h1>This link is not valid</h1><p>The unsubscribe link may be incomplete or out of date. You can manage your alerts by signing in to <a href="https://finda.sale/shopper/notify-me">your account</a>.</p>',
        400
      );
    }
    const result = await unsubscribeNotifyMeEmail(email);
    console.log(`[notifyMe] Unsubscribed via email link (search=${result.search}, waitlist=${result.waitlist})`);
    return page(
      'Unsubscribed',
      '<h1>You are unsubscribed</h1><p>We will not send any more Notify Me emails to this address.</p><p><a href="https://finda.sale">Back to FindA.Sale</a></p>'
    );
  } catch (err) {
    console.error('GET /api/shopper/waitlist/unsubscribe error:', err);
    return page('Something went wrong', '<h1>Something went wrong</h1><p>Please try the link again in a moment.</p>', 500);
  }
});

// POST /api/shopper/waitlist/unsubscribe?token=...  (PUBLIC, RFC 8058 one-click)
// Mail clients that see "List-Unsubscribe-Post: List-Unsubscribe=One-Click" POST to the header URL with no
// cookies and no CSRF token (the request is authenticated by the HMAC token in the query string).
router.post('/unsubscribe', searchLimiter, async (req: Request, res: Response) => {
  try {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const email = token ? verifyNotifyMeToken(token) : null;
    if (!email) return res.status(400).json({ message: 'Invalid token' });
    const result = await unsubscribeNotifyMeEmail(email);
    console.log(`[notifyMe] One-click unsubscribe (search=${result.search}, waitlist=${result.waitlist})`);
    return res.status(200).json({ message: 'Unsubscribed' });
  } catch (err) {
    console.error('POST /api/shopper/waitlist/unsubscribe error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/shopper/waitlist/confirm?token=...  (PUBLIC, no auth)
// Double opt-in for anonymous /search/notify alerts. The link in the confirmation email proves the
// recipient controls the address; only then does the sender start emailing it. The token is an HMAC with
// the purpose "notify-confirm" (a different domain than the unsubscribe token) and expires after 7 days.
router.get('/confirm', searchLimiter, async (req: Request, res: Response) => {
  const page = (title: string, body: string, status = 200) => sendPage(res, title, body, status);
  try {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const email = token ? verifyNotifyConfirmToken(token) : null;
    if (!email) {
      return page(
        'Link not valid',
        '<h1>This link is not valid</h1><p>The confirmation link may be incomplete or expired (links work for 7 days). Go back to <a href="https://finda.sale">FindA.Sale</a> and request the alert again.</p>',
        400
      );
    }
    const confirmed = await confirmNotifyMeEmail(email);
    console.log(`[notifyMe] Confirmed via email link (alerts=${confirmed})`);
    return page(
      'Alert confirmed',
      confirmed > 0
        ? '<h1>You are confirmed</h1><p>We will email you when a match is listed. Every email has a link to stop them.</p><p><a href="https://finda.sale">Back to FindA.Sale</a></p>'
        : '<h1>Nothing to confirm</h1><p>Your alert is already confirmed, or it is no longer active. You can add a new one from <a href="https://finda.sale">FindA.Sale</a>.</p>'
    );
  } catch (err) {
    console.error('GET /api/shopper/waitlist/confirm error:', err);
    return page('Something went wrong', '<h1>Something went wrong</h1><p>Please try the link again in a moment.</p>', 500);
  }
});

export default router;
