import express from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { Webhook } from 'svix';
import { prisma } from '../lib/prisma';
import { suppressionService } from '../services/suppressionService';

const router = express.Router();

// Rate limiter for unsubscribe endpoint — prevents abuse (10 per hour per IP)
const unsubscribeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many unsubscribe requests. Please try again later.' },
  skip: (req) => {
    // Only apply rate limit to POST requests (GET unsubscribes are links, not programmatic)
    return req.method !== 'POST';
  },
});

// Rate limiter for pixel tracking endpoint (30 req/min per IP) — legitimate email clients can open same email multiple times
const pixelLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many pixel tracking requests.' },
});

// Rate limiter for click tracking endpoint (10 req/min per IP) — click spam prevention
const clickLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many click tracking requests.' },
});

router.get('/pixel', pixelLimiter, async (req, res) => {
  try {
    const { trackingId } = req.query;
    if (!trackingId || typeof trackingId !== 'string') {
      return res.status(400).json({ error: 'Missing trackingId' });
    }

    const record = await prisma.directoryClaimEmail.findUnique({
      where: { trackingPixelId: trackingId },
    });

    if (record) {
      const touchNum = determineCurrentTouch(record);
      if (touchNum) {
        const updateData: any = {
          [`touch${touchNum}Opened`]: true,
          [`touch${touchNum}OpenedAt`]: new Date(),
        };
        await prisma.directoryClaimEmail.update({
          where: { id: record.id },
          data: updateData,
        });
      }
    }

    res.set('Content-Type', 'image/gif');
    res.send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
  } catch (err: any) {
    console.error('[OutreachPixel] Error:', err.message);
    res.status(500).json({ error: 'Tracking error' });
  }
});

router.get('/click', clickLimiter, async (req, res) => {
  try {
    const { trackingId, original } = req.query;
    if (!trackingId || typeof trackingId !== 'string' || !original || typeof original !== 'string') {
      return res.status(400).json({ error: 'Missing trackingId or original URL' });
    }

    const record = await prisma.directoryClaimEmail.findUnique({
      where: { trackingToken: trackingId },
    });

    if (record) {
      const touchNum = determineCurrentTouch(record);
      if (touchNum) {
        const updateData: any = {
          [`touch${touchNum}Clicked`]: true,
          [`touch${touchNum}ClickedAt`]: new Date(),
        };
        await prisma.directoryClaimEmail.update({
          where: { id: record.id },
          data: updateData,
        });
      }
    }

    // Open-redirect guard: only allow redirects to finda.sale domains
    const decodedUrl = decodeURIComponent(original);
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(decodedUrl);
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }
    const allowedHosts = ['finda.sale', 'www.finda.sale'];
    if (!allowedHosts.includes(parsedUrl.hostname)) {
      return res.status(400).json({ error: 'Redirect destination not allowed' });
    }

    res.redirect(302, decodedUrl);
  } catch (err: any) {
    console.error('[OutreachClick] Error:', err.message);
    res.status(500).json({ error: 'Redirect error' });
  }
});

// Shared handler for GET (link click) and POST (RFC 8058 one-click from Gmail/Yahoo)
const handleUnsubscribe = async (req: express.Request, res: express.Response) => {
  try {
    // Token may arrive in query (GET) or body (POST one-click)
    const token = (req.query.token || req.body?.token) as string | undefined;
    if (!token || typeof token !== 'string') {
      return res.status(400).send('<html><body>Invalid or missing token</body></html>');
    }

    try {
      const secret = process.env.OUTREACH_SECRET;
      if (!secret) {
        throw new Error('OUTREACH_SECRET environment variable is not configured');
      }
      const decoded = jwt.verify(token, secret) as any;
      const { email, organizerId } = decoded;
      await suppressionService.processOptOut(email);

      // Log OPTED_OUT event for CAN-SPAM audit trail
      if (organizerId) {
        try {
          await prisma.outreachAuditLog.create({
            data: {
              organizerId,
              event: 'OPTED_OUT',
              touchNumber: null,
            },
          });
        } catch (auditErr: any) {
          console.error('[OutreachAudit] Failed to log OPTED_OUT event for org:', organizerId, '—', auditErr.message);
        }
      }

      res.status(200).send('<html><body><p>You have been unsubscribed. You will not receive further emails from FindA.Sale.</p></body></html>');
    } catch (jwtErr: any) {
      console.error('[OutreachUnsubscribe] JWT error:', jwtErr.message);
      res.status(400).send('<html><body>Invalid or expired token</body></html>');
    }
  } catch (err: any) {
    console.error('[OutreachUnsubscribe] Error:', err.message);
    res.status(500).send('<html><body>Error processing unsubscribe</body></html>');
  }
};

router.get('/unsubscribe', handleUnsubscribe);
// RFC 8058 one-click POST — Gmail/Yahoo POST to this when user clicks the inbox unsubscribe button.
// Body is application/x-www-form-urlencoded with "List-Unsubscribe=One-Click". Token comes from URL query.
// Security: token validation is the auth mechanism. Explicit token required in query or body.
// Rate limiting applied to POST to prevent abuse via forged requests.
router.post('/unsubscribe', unsubscribeLimiter, express.urlencoded({ extended: false }), handleUnsubscribe);

router.post('/page-view', async (req, res) => {
  try {
    const { organizerId, touchNumber, tier } = req.body;
    if (!organizerId || typeof organizerId !== 'string' || organizerId.trim() === '') {
      return res.status(400).json({ error: 'organizerId is required' });
    }

    await prisma.outreachAuditLog.create({
      data: {
        organizerId: organizerId.trim(),
        event: 'ORGANIZER_PAGE_VIEWED',
        touchNumber: typeof touchNumber === 'number' ? touchNumber : null,
        metadata: tier ? { tier } : null,
      },
    });

    res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error('[OutreachPageView] Error:', err.message);
    res.status(500).json({ error: 'Tracking error' });
  }
});

router.post('/resend-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) {
      console.warn('[OutreachWebhook] RESEND_WEBHOOK_SECRET not set — falling back to request body validation only. Set RESEND_WEBHOOK_SECRET for full signature verification.');
      // Fall back to processing without signature verification (less secure but non-blocking)
      const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      return await handleResendWebhook(payload, res);
    }

    const svixId = req.headers['svix-id'] as string;
    const svixTimestamp = req.headers['svix-timestamp'] as string;
    const svixSignature = req.headers['svix-signature'] as string;

    if (!svixId || !svixTimestamp || !svixSignature) {
      console.warn('[OutreachWebhook] Missing Svix headers (svix-id, svix-timestamp, or svix-signature)');
      return res.status(401).json({ error: 'Unauthorized: missing webhook signature headers' });
    }

    const wh = new Webhook(secret);
    const payload = wh.verify(req.body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });

    await handleResendWebhook(payload, res);
  } catch (err: any) {
    // Webhook signature verification failed or payload parsing failed
    if (err.message?.includes('signature') || err.message?.includes('timestamp')) {
      console.warn('[OutreachWebhook] Signature verification failed:', err.message);
      return res.status(401).json({ error: 'Unauthorized: invalid webhook signature' });
    }
    console.error('[OutreachWebhook] Error:', err.message);
    res.status(500).json({ error: 'Webhook error' });
  }
});

async function handleResendWebhook(payload: any, res: express.Response): Promise<void> {
  const { type, email, bounce_type } = payload;
  if (!email) return res.status(400).json({ error: 'Missing email' });

  if (type === 'email.bounced') {
    const bounceReason = bounce_type === 'hard' ? 'hard_bounce' : 'soft_bounce';
    await suppressionService.addSuppression(email, bounceReason as any);
  }

  if (type === 'email.complaint') {
    await suppressionService.processComplaint(email);
  }

  res.status(200).json({ ok: true });
}

function determineCurrentTouch(record: any): number | null {
  if (record.touch4SentAt) return 4;
  if (record.touch3SentAt) return 3;
  if (record.touch2SentAt) return 2;
  if (record.touch1SentAt) return 1;
  return null;
}

export default router;
