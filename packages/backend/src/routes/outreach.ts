import express from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { suppressionService } from '../services/suppressionService';

const router = express.Router();

router.get('/pixel', async (req, res) => {
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

router.get('/click', async (req, res) => {
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

    res.redirect(302, decodeURIComponent(original));
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
      const decoded = jwt.verify(token, process.env.OUTREACH_SECRET || 'default-secret') as any;
      const { email } = decoded;
      await suppressionService.processOptOut(email);
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
router.post('/unsubscribe', express.urlencoded({ extended: false }), handleUnsubscribe);

router.post('/resend-webhook', async (req, res) => {
  try {
    const { type, email, bounce_type } = req.body;
    if (!email) return res.status(400).json({ error: 'Missing email' });

    if (type === 'email.bounced') {
      const bounceReason = bounce_type === 'hard' ? 'hard_bounce' : 'soft_bounce';
      await suppressionService.addSuppression(email, bounceReason as any);
    }

    if (type === 'email.complaint') {
      await suppressionService.processComplaint(email);
    }

    res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error('[OutreachWebhook] Error:', err.message);
    res.status(500).json({ error: 'Webhook error' });
  }
});

function determineCurrentTouch(record: any): number | null {
  if (record.touch4SentAt) return 4;
  if (record.touch3SentAt) return 3;
  if (record.touch2SentAt) return 2;
  if (record.touch1SentAt) return 1;
  return null;
}

export default router;
