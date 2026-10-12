/**
 * Public endpoints for the organizer-recruitment cold-send channel.
 *
 *   GET  /api/recruit/unsubscribe?token=   link in the email footer
 *   POST /api/recruit/unsubscribe?token=   RFC 8058 one-click (Gmail / Yahoo)
 *   POST /api/recruit/resend-webhook       provider events (svix-signed)
 *
 * Copied from routes/outreach.ts (unsubscribe + resend-webhook) but keyed on the
 * channel's own secrets (RECRUIT_UNSUB_SECRET, RECRUIT_RESEND_WEBHOOK_SECRET),
 * so a token or webhook from the Gmail outreach channel is never accepted here.
 * The raw body parser for the webhook is registered in index.ts before
 * express.json, like the outreach webhook.
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { Webhook } from 'svix';
import { prisma } from '../lib/prisma';
import { suppressionService } from '../services/suppressionService';
import { classifyDiagnosticKeywords } from '../services/bounceSuppressService';
import { bumpRecruitDailyStat, evaluateHealth, tagSuppressionSource } from '../services/recruitSendService';

const router = express.Router();

const unsubscribeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many unsubscribe requests. Please try again later.' },
  skip: (req) => req.method !== 'POST',
});

const handleUnsubscribe = async (req: express.Request, res: express.Response) => {
  try {
    const token = (req.query.token || req.body?.token) as string | undefined;
    if (!token || typeof token !== 'string') {
      return res.status(400).send('<html><body>Invalid or missing token</body></html>');
    }
    const secret = process.env.RECRUIT_UNSUB_SECRET;
    if (!secret) {
      console.error('[RecruitUnsubscribe] RECRUIT_UNSUB_SECRET is not configured');
      return res.status(503).send('<html><body>Unsubscribe is temporarily unavailable. Please reply to the email with "unsubscribe".</body></html>');
    }
    let decoded: any;
    try {
      decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
    } catch (jwtErr: any) {
      console.warn('[RecruitUnsubscribe] JWT error:', jwtErr.message);
      return res.status(400).send('<html><body>Invalid or expired token</body></html>');
    }
    const email = typeof decoded?.email === 'string' ? decoded.email.toLowerCase() : '';
    if (!email || decoded?.ch !== 'recruit') {
      return res.status(400).send('<html><body>Invalid token</body></html>');
    }

    await suppressionService.processOptOut(email);
    await tagSuppressionSource(email);
    await prisma.recruitLead.updateMany({
      where: { email },
      data: { status: 'SUPPRESSED', nextSendAt: null },
    });

    res.status(200).send('<html><body><p>You have been unsubscribed. You will not receive further emails from FindA.Sale.</p></body></html>');
  } catch (err: any) {
    console.error('[RecruitUnsubscribe] Error:', err.message);
    res.status(500).send('<html><body>Error processing unsubscribe</body></html>');
  }
};

router.get('/unsubscribe', handleUnsubscribe);
router.post('/unsubscribe', unsubscribeLimiter, express.urlencoded({ extended: false }), handleUnsubscribe);

router.post('/resend-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const secret = process.env.RECRUIT_RESEND_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed: never process an unsigned payload.
    console.error('[RecruitWebhook] RECRUIT_RESEND_WEBHOOK_SECRET not set - rejecting webhook (fail-closed)');
    return res.status(503).json({ error: 'Webhook not configured' });
  }

  const svixId = req.headers['svix-id'] as string;
  const svixTimestamp = req.headers['svix-timestamp'] as string;
  const svixSignature = req.headers['svix-signature'] as string;
  if (!svixId || !svixTimestamp || !svixSignature) {
    return res.status(401).json({ error: 'Unauthorized: missing webhook signature headers' });
  }

  let payload: any;
  try {
    const wh = new Webhook(secret);
    payload = wh.verify(req.body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch (err: any) {
    console.warn('[RecruitWebhook] Signature verification failed:', err.message);
    return res.status(401).json({ error: 'Unauthorized: invalid webhook signature' });
  }

  // Dedupe on svix-id (retries reuse it). 'recruit:' prefix keeps these rows out of
  // the Square stale-PENDING sweep, which only reads 'square:' rows.
  const eventId = `recruit:${svixId}`;
  try {
    await prisma.processedWebhookEvent.create({ data: { eventId, status: 'PENDING' } });
  } catch (err: any) {
    if (err?.code !== 'P2002') {
      console.error('[RecruitWebhook] Could not record event:', err?.message);
      return res.status(500).json({ error: 'Webhook error' });
    }
    const existing = await prisma.processedWebhookEvent.findUnique({ where: { eventId } });
    if (existing?.status === 'COMPLETED') return res.status(200).json({ ok: true, duplicate: true });
    const reclaim = await prisma.processedWebhookEvent.updateMany({
      where: { eventId, status: 'FAILED' },
      data: { status: 'PENDING' },
    });
    if (reclaim.count === 0) return res.status(409).json({ error: 'Event in flight' });
  }

  try {
    await handleRecruitEvent(payload);
    await prisma.processedWebhookEvent.update({ where: { eventId }, data: { status: 'COMPLETED' } });
    res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error('[RecruitWebhook] Handler error:', err?.message);
    await prisma.processedWebhookEvent
      .update({ where: { eventId }, data: { status: 'FAILED' } })
      .catch(() => undefined);
    res.status(500).json({ error: 'Webhook error' });
  }
});

async function handleRecruitEvent(payload: any): Promise<void> {
  const type: string | undefined = payload?.type;
  const data = payload?.data || {};
  const toList: string[] = Array.isArray(data.to) ? data.to : data.to ? [data.to] : [];
  const emailId: string | undefined = data.email_id;
  const bounceType: string | undefined = data?.bounce?.type; // 'Permanent' | 'Transient' | 'Undetermined'
  const now = new Date();

  const send = emailId ? await prisma.recruitSend.findUnique({ where: { resendEmailId: emailId } }) : null;
  let needsHealthCheck = false;

  for (const raw of toList) {
    const addr = String(raw).toLowerCase();

    if (type === 'email.bounced') {
      const hard = bounceType === 'Permanent';
      if (hard) {
        const diag: string | undefined = data?.bounce?.message || undefined;
        const category = diag ? classifyDiagnosticKeywords(diag) ?? undefined : undefined;
        await suppressionService.addSuppression(addr, 'hard_bounce', {
          resendEventId: emailId,
          ...(diag ? { diagnosticCode: diag.slice(0, 500) } : {}),
          ...(category ? { bounceCategory: category } : {}),
        });
        await tagSuppressionSource(addr);
        await prisma.recruitLead.updateMany({ where: { email: addr }, data: { status: 'SUPPRESSED', nextSendAt: null } });
      } else {
        await suppressionService.addSuppression(addr, 'soft_bounce', { resendEventId: emailId });
        await tagSuppressionSource(addr);
      }
      if (send && !send.bouncedAt) {
        await prisma.recruitSend.update({ where: { id: send.id }, data: { bouncedAt: now, bounceType: bounceType || 'Undetermined' } });
      }
      await bumpRecruitDailyStat(hard ? 'hardBounced' : 'softBounced');
      needsHealthCheck = true;
    }

    if (type === 'email.complained') {
      await suppressionService.processComplaint(addr, { resendEventId: emailId });
      await tagSuppressionSource(addr);
      await prisma.recruitLead.updateMany({ where: { email: addr }, data: { status: 'SUPPRESSED', nextSendAt: null } });
      if (send && !send.complainedAt) {
        await prisma.recruitSend.update({ where: { id: send.id }, data: { complainedAt: now } });
      }
      await bumpRecruitDailyStat('complained');
      needsHealthCheck = true;
    }

    if (type === 'email.suppressed') {
      await suppressionService.addSuppression(addr, 'hard_bounce', { resendEventId: emailId });
      await tagSuppressionSource(addr);
      await prisma.recruitLead.updateMany({ where: { email: addr }, data: { status: 'SUPPRESSED', nextSendAt: null } });
    }

    if (type === 'email.delivered') {
      try {
        await suppressionService.resetSoftBounce(addr);
      } catch (resetErr: any) {
        console.error(`[RecruitWebhook] Failed to reset soft-bounce state for ${addr}:`, resetErr.message);
      }
      if (send && !send.deliveredAt) {
        await prisma.recruitSend.update({ where: { id: send.id }, data: { deliveredAt: now } });
      }
    }
  }

  if (needsHealthCheck) await evaluateHealth();
}

export default router;
