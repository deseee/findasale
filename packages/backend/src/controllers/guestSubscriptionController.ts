/**
 * Public endpoints of the guest email double opt-in (2026-09-30). See services/guestSaleSubscriptionService.ts for the
 * whole flow. None of these needs a session; each is limited per IP by the route's searchLimiter, and the confirmation
 * email is additionally limited per address inside the service.
 */
import { Request, Response } from 'express';
import {
  requestGuestEmailSubscription,
  confirmGuestEmailSubscription,
  unsubscribeGuestReminderEmail,
  verifyGuestReminderUnsubToken,
} from '../services/guestSaleSubscriptionService';

// POST /api/notifications/subscribe-guest  { saleId, email }
export const subscribeGuestToSale = async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as { saleId?: unknown; email?: unknown };
    const result = await requestGuestEmailSubscription({ saleId: body.saleId, email: body.email });
    if (!result.ok) return res.status(result.status).json({ message: result.message, code: result.code });
    return res.json({ status: 'pending_confirmation', message: result.message });
  } catch (err) {
    console.error('[guestSubscribe] subscribe-guest error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
};

// POST /api/notifications/confirm-email-subscription  { token }
export const confirmGuestSubscription = async (req: Request, res: Response) => {
  try {
    const token = (req.body as { token?: unknown } | undefined)?.token;
    const result = await confirmGuestEmailSubscription(token);
    if (!result.ok) {
      return res.status(400).json({
        message: 'This confirmation link is not valid. It may have expired (links work once, for 48 hours) or already been used.',
        code: 'CONFIRM_LINK_INVALID',
      });
    }
    return res.json({ status: 'confirmed', saleId: result.saleId, saleTitle: result.saleTitle });
  } catch (err) {
    console.error('[guestSubscribe] confirm error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ message: 'Something went wrong. Please try the link again in a moment.' });
  }
};

const sendPage = (res: Response, title: string, body: string, status = 200): Response =>
  res
    .status(status)
    .type('html')
    .send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="robots" content="noindex"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:Arial,Helvetica,sans-serif;background:#fafaf9;color:#292524}
.card{max-width:440px;margin:16px;padding:32px 28px;background:#fff;border:1px solid #e7e5e4;border-radius:12px;text-align:center}
a{color:#b45309}h1{font-size:20px;margin:0 0 12px}p{margin:0 0 12px;line-height:1.5;color:#57534e}
@media (prefers-color-scheme:dark){body{background:#1c1917;color:#f5f5f4}.card{background:#292524;border-color:#44403c}p{color:#d6d3d1}a{color:#fbbf24}}</style></head>
<body><div class="card">${body}</div></body></html>`);

// GET /api/notifications/guest-unsubscribe?token=...   (link in every guest reminder and confirmation email)
export const guestUnsubscribePage = async (req: Request, res: Response) => {
  try {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const email = token ? verifyGuestReminderUnsubToken(token) : null;
    if (!email) {
      return sendPage(
        res,
        'Link not valid',
        '<h1>This link is not valid</h1><p>The unsubscribe link may be incomplete or out of date. Reply to any FindA.Sale reminder email and we will stop them for you.</p>',
        400
      );
    }
    const count = await unsubscribeGuestReminderEmail(email);
    console.log(`[guestSubscribe] unsubscribed via email link (rows=${count})`);
    return sendPage(
      res,
      'Unsubscribed',
      '<h1>You are unsubscribed</h1><p>We will not send any more sale reminders to this address.</p><p><a href="https://finda.sale">Back to FindA.Sale</a></p>'
    );
  } catch (err) {
    console.error('[guestSubscribe] unsubscribe page error:', err instanceof Error ? err.message : err);
    return sendPage(res, 'Something went wrong', '<h1>Something went wrong</h1><p>Please try the link again in a moment.</p>', 500);
  }
};

// POST /api/notifications/guest-unsubscribe?token=...   (RFC 8058 one-click, no cookies, no CSRF token)
export const guestUnsubscribeOneClick = async (req: Request, res: Response) => {
  try {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const email = token ? verifyGuestReminderUnsubToken(token) : null;
    if (!email) return res.status(400).json({ message: 'Invalid token' });
    const count = await unsubscribeGuestReminderEmail(email);
    console.log(`[guestSubscribe] one-click unsubscribe (rows=${count})`);
    return res.status(200).json({ message: 'Unsubscribed' });
  } catch (err) {
    console.error('[guestSubscribe] one-click unsubscribe error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ message: 'Server error' });
  }
};
