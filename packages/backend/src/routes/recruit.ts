/**
 * routes/recruit.ts -- ADR-139 public endpoints for the organizer recruit channel.
 *
 *   GET  /api/recruit/status                       is the interest form open (no per-address info)
 *   POST /api/recruit/interest                     double-opt-in form (5/hour per IP, honeypot, strict body)
 *   POST /api/recruit/confirm                      {leadId, sig} from the confirm page button
 *   POST /api/recruit/unsubscribe/:leadId/:sig     RFC 8058 one-click (200, no content)
 *   GET  /api/recruit/unsubscribe/:leadId/:sig     footer link -> 303 to the frontend confirmation page
 *
 * Every answer is identical for existing and non-existing addresses / leads. Signatures are
 * HMAC with constant-time compare (recruitTokens.ts). No status, consent or transport field
 * is ever read from a request body.
 */
import express, { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import * as Sentry from '@sentry/node';
import { confirmSchema, interestSchema } from '../services/recruit/recruitSchemas';
import { getRecruitConfig } from '../services/recruit/recruitConfig';
import { getKillSwitchState } from '../services/recruit/recruitGuards';
import { checkTransportReady } from '../services/recruit/recruitTransport';
import { confirmLead, submitInterest, unsubscribeLead } from '../services/recruit/recruitLeadService';

const router = express.Router();

const keyByIp = (req: any): string => req.ip ?? '0.0.0.0';

const interestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: keyByIp,
  validate: false,
  standardHeaders: false,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

const confirmLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: keyByIp,
  validate: false,
  standardHeaders: false,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

const unsubscribeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: keyByIp,
  validate: false,
  standardHeaders: false,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

const statusLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: keyByIp,
  validate: false,
  standardHeaders: false,
  legacyHeaders: false,
});

const GENERIC_ACCEPTED = 'Thanks. If that address can receive our email, a confirmation link is on its way. Please check your inbox.';
const GENERIC_BAD_LINK = 'This link is not valid.';

const ALLOWED_SRC = new Set(['profile', 'claim_page', 'claim_email', 'city', 'other']);

router.get('/status', statusLimiter, async (_req: Request, res: Response) => {
  try {
    const cfg = getRecruitConfig();
    const ks = await getKillSwitchState(cfg);
    const open = ks.open && checkTransportReady(cfg).ok;
    res.json({ open });
  } catch (err: any) {
    // A failure here (usually the database) must not look like a deliberate "closed" answer.
    console.error('[recruit] status check failed, answering 503:', err?.message ?? err);
    Sentry.captureException(err, { tags: { route: 'recruit-status' } });
    res.status(503).json({ open: false, error: true });
  }
});

router.post('/interest', interestLimiter, async (req: Request, res: Response) => {
  const parsed = interestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Please check the form and try again.' });
  }
  const body = parsed.data;
  if (body.website && body.website.trim() !== '') {
    // Bot filled the honeypot: answer exactly like a real submission, do nothing.
    return res.json({ ok: true, message: GENERIC_ACCEPTED });
  }
  try {
    const outcome = await submitInterest({
      email: body.email,
      businessName: body.businessName,
      state: body.state ? body.state.toUpperCase() : null,
      src: body.src && ALLOWED_SRC.has(body.src) ? body.src : body.src ? 'other' : null,
      org: body.org ?? null,
      ip: req.ip,
    });
    if (outcome === 'closed') {
      return res.status(503).json({ closed: true, error: 'This form is not open right now. You can create a free account instead.' });
    }
    return res.json({ ok: true, message: GENERIC_ACCEPTED });
  } catch (err: any) {
    console.error('[recruit] interest error:', err?.message ?? err);
    return res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
});

router.post('/confirm', confirmLimiter, async (req: Request, res: Response) => {
  const parsed = confirmSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: GENERIC_BAD_LINK });
  try {
    const ok = await confirmLead(parsed.data.leadId, parsed.data.sig, req.ip);
    if (!ok) return res.status(400).json({ error: GENERIC_BAD_LINK });
    return res.json({ ok: true });
  } catch (err: any) {
    console.error('[recruit] confirm error:', err?.message ?? err);
    return res.status(500).json({ error: 'Something went wrong. Please try again later.' });
  }
});

function paramsOk(leadId: unknown, sig: unknown): leadId is string {
  return typeof leadId === 'string' && typeof sig === 'string' && leadId.length <= 64 && sig.length <= 128;
}

// RFC 8058 one-click. Body is "List-Unsubscribe=One-Click"; it is not needed to act.
router.post('/unsubscribe/:leadId/:sig', unsubscribeLimiter, async (req: Request, res: Response) => {
  const { leadId, sig } = req.params;
  if (!paramsOk(leadId, sig)) return res.status(400).send(GENERIC_BAD_LINK);
  try {
    const ok = await unsubscribeLead(leadId, sig as string);
    if (!ok) return res.status(400).send(GENERIC_BAD_LINK);
    return res.status(200).end();
  } catch (err: any) {
    console.error('[recruit] one-click unsubscribe error:', err?.message ?? err);
    return res.status(500).end();
  }
});

router.get('/unsubscribe/:leadId/:sig', unsubscribeLimiter, async (req: Request, res: Response) => {
  const { leadId, sig } = req.params;
  if (!paramsOk(leadId, sig)) return res.status(400).send(GENERIC_BAD_LINK);
  try {
    const ok = await unsubscribeLead(leadId, sig as string);
    if (!ok) return res.status(400).send(GENERIC_BAD_LINK);
    return res.redirect(303, `${getRecruitConfig().frontendUrl}/recruit/unsubscribe?done=1`);
  } catch (err: any) {
    console.error('[recruit] unsubscribe error:', err?.message ?? err);
    return res.status(500).send('Something went wrong. Please try again later.');
  }
});

export default router;
