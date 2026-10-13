/**
 * routes/adminRecruit.ts -- ADR-139 §7 admin API for the organizer recruit channel.
 * Mounted at /api/admin/recruit. Every route: authenticate + requireAdmin. Every body is a zod
 * .strict() schema (unknown keys -> 400, so status / consentAt / transport can never be set
 * by a client). There is no delete endpoint.
 */
import express, { Response } from 'express';
import { z } from 'zod';
import { RecruitLeadSource, RecruitLeadStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/adminAuth';
import { getRecruitConfig, RECRUIT_FLAG_KEY } from '../services/recruit/recruitConfig';
import { evaluateHealth, getKillSwitchState, quotaUsedToday } from '../services/recruit/recruitGuards';
import { checkTransportReady } from '../services/recruit/recruitTransport';
import {
  approveBatch,
  buildFromDirectory,
  createManualLead,
  previewLead,
  sendabilityUnderTransport,
  skipLead,
  testSend,
} from '../services/recruit/recruitLeadService';
import {
  LeadId,
  batchSchema,
  buildSchema,
  listQuerySchema,
  manualSchema,
  pauseSchema,
  resumeSchema,
  skipSchema,
  testSendSchema,
} from '../services/recruit/recruitSchemas';

const router = express.Router();
router.use(authenticate, requireAdmin);

const ID = LeadId;
const listQuery = listQuerySchema;

function bad(res: Response, err: z.ZodError) {
  return res.status(400).json({ error: 'Invalid request', issues: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
}

function fail(res: Response, where: string, err: any) {
  console.error(`[admin-recruit] ${where}:`, err?.message ?? err);
  return res.status(500).json({ error: 'Something went wrong' });
}

router.get('/stats', async (_req: AuthRequest, res: Response) => {
  try {
    const cfg = getRecruitConfig();
    const now = new Date();
    const since = new Date(now.getTime() - cfg.bounceWindowDays * 24 * 60 * 60 * 1000);
    const [ks, usedToday, health, unsubscribes, byStatus, bySource, lastPause, converted, stepCounts, confirmSent] = await Promise.all([
      getKillSwitchState(cfg),
      quotaUsedToday(now),
      evaluateHealth(cfg, now),
      prisma.recruitLead.count({ where: { unsubscribedAt: { gte: since } } }),
      prisma.recruitLead.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.recruitLead.groupBy({ by: ['source'], _count: { _all: true } }),
      prisma.recruitChannelEvent.findFirst({
        where: { type: { in: ['PAUSED', 'AUTO_PAUSED', 'RESUMED'] } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.recruitLead.count({ where: { convertedAt: { not: null } } }),
      prisma.recruitSend.groupBy({ by: ['kind'], where: { sentAt: { gte: since } }, _count: { _all: true } }),
      prisma.recruitSend.count({ where: { kind: 'CONFIRM', sentAt: { gte: since } } }),
    ]);
    const ready = checkTransportReady(cfg);
    res.json({
      today: { used: usedToday, cap: cfg.dailyCap },
      window: {
        days: cfg.bounceWindowDays,
        sent: health.metrics.sent,
        confirmSent,
        hardBounces: health.metrics.hardBounces,
        bouncePct: health.metrics.bouncePct,
        complaints: health.metrics.complaints,
        unsubscribes,
        byKind: Object.fromEntries(stepCounts.map((s) => [s.kind, s._count._all])),
      },
      killSwitch: { env: ks.env, flag: ks.flag, transport: ks.transport, open: ks.open },
      transportReady: ready.ok ? { ok: true } : { ok: false, reason: ready.reason },
      health: { wouldPause: health.shouldPause, reason: health.reason },
      lastPauseEvent: lastPause
        ? { type: lastPause.type, reason: lastPause.reason, actorId: lastPause.actorId, createdAt: lastPause.createdAt }
        : null,
      queue: {
        byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
        bySource: Object.fromEntries(bySource.map((r) => [r.source, r._count._all])),
      },
      converted,
      config: {
        planTier: cfg.planTier,
        sendingDomain: cfg.sendingDomain,
        fromEmail: cfg.fromEmail || null,
        replyToSet: Boolean(cfg.replyTo),
        mailingAddressSet: Boolean(cfg.mailingAddress),
        thresholds: {
          bouncePausePct: cfg.bouncePausePct,
          bounceMinSample: cfg.bounceMinSample,
          bouncePauseAbsolute: cfg.bouncePauseAbsolute,
        },
      },
    });
  } catch (err) {
    fail(res, 'stats', err);
  }
});

router.get('/leads', async (req: AuthRequest, res: Response) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return bad(res, parsed.error);
  try {
    const cfg = getRecruitConfig();
    const { status, source, cursor } = parsed.data;
    const limit = parsed.data.limit ?? 50;
    const rows = await prisma.recruitLead.findMany({
      where: {
        ...(status ? { status: status as RecruitLeadStatus } : {}),
        ...(source ? { source: source as RecruitLeadSource } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        email: true,
        businessName: true,
        state: true,
        source: true,
        sourceDetail: true,
        status: true,
        sequenceStep: true,
        nextSendAt: true,
        consentAt: true,
        consentSource: true,
        skipReason: true,
        lastError: true,
        sentAt: true,
        convertedAt: true,
        createdAt: true,
      },
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    res.json({
      leads: page.map((l) => {
        const s = sendabilityUnderTransport(l, cfg);
        return { ...l, sendableUnderCurrentTransport: s.sendable, notSendableReason: s.reason };
      }),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  } catch (err) {
    fail(res, 'leads', err);
  }
});

router.post('/leads/build-from-directory', async (req: AuthRequest, res: Response) => {
  const parsed = buildSchema.safeParse(req.body ?? {});
  if (!parsed.success) return bad(res, parsed.error);
  try {
    res.json(await buildFromDirectory(parsed.data.limit, req.user.id));
  } catch (err) {
    fail(res, 'build-from-directory', err);
  }
});

router.post('/leads/manual', async (req: AuthRequest, res: Response) => {
  const parsed = manualSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error);
  try {
    const result = await createManualLead(
      { ...parsed.data, state: parsed.data.state ? parsed.data.state.toUpperCase() : null },
      req.user.id
    );
    if (!result.ok) return res.status(409).json({ error: result.error });
    res.status(201).json({ id: result.id });
  } catch (err) {
    fail(res, 'manual', err);
  }
});

router.post('/batches', async (req: AuthRequest, res: Response) => {
  const parsed = batchSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error);
  try {
    res.json(await approveBatch(parsed.data.leadIds, parsed.data.note, req.user.id, getRecruitConfig()));
  } catch (err) {
    fail(res, 'batches', err);
  }
});

router.post('/leads/:id/skip', async (req: AuthRequest, res: Response) => {
  const id = ID.safeParse(req.params.id);
  const parsed = skipSchema.safeParse(req.body);
  if (!id.success) return bad(res, id.error);
  if (!parsed.success) return bad(res, parsed.error);
  try {
    const ok = await skipLead(id.data, parsed.data.reason);
    if (!ok) return res.status(409).json({ error: 'This lead cannot be skipped in its current state.' });
    res.json({ ok: true });
  } catch (err) {
    fail(res, 'skip', err);
  }
});

router.get('/leads/:id/preview', async (req: AuthRequest, res: Response) => {
  const id = ID.safeParse(req.params.id);
  if (!id.success) return bad(res, id.error);
  try {
    const preview = await previewLead(id.data, getRecruitConfig());
    if (!preview) return res.status(404).json({ error: 'Lead not found' });
    res.json(preview);
  } catch (err) {
    fail(res, 'preview', err);
  }
});

router.post('/test-send', async (req: AuthRequest, res: Response) => {
  const parsed = testSendSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error);
  try {
    // Recipient is always the signed-in admin's own address, read from the database.
    const admin = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, email: true } });
    if (!admin?.email) return res.status(400).json({ error: 'Your account has no email address.' });
    const result = await testSend(parsed.data.leadId, admin, getRecruitConfig());
    if (!result.ok) return res.status(409).json({ error: result.error });
    res.json({ ok: true, sentTo: admin.email });
  } catch (err) {
    fail(res, 'test-send', err);
  }
});

router.post('/pause', async (req: AuthRequest, res: Response) => {
  const parsed = pauseSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error);
  try {
    await prisma.featureFlag.updateMany({ where: { key: RECRUIT_FLAG_KEY }, data: { enabled: false, updatedBy: req.user.id } });
    await prisma.recruitChannelEvent.create({ data: { type: 'PAUSED', reason: parsed.data.reason, actorId: req.user.id } });
    res.json({ ok: true });
  } catch (err) {
    fail(res, 'pause', err);
  }
});

router.post('/resume', async (req: AuthRequest, res: Response) => {
  const parsed = resumeSchema.safeParse(req.body);
  if (!parsed.success) return bad(res, parsed.error);
  try {
    const cfg = getRecruitConfig();
    const health = await evaluateHealth(cfg);
    if (health.shouldPause) {
      return res.status(409).json({
        error: `Cannot resume yet: ${health.reason}. This clears once those events are older than ${cfg.bounceWindowDays} days.`,
      });
    }
    await prisma.featureFlag.upsert({
      where: { key: RECRUIT_FLAG_KEY },
      create: {
        key: RECRUIT_FLAG_KEY,
        description: 'Organizer recruit channel send switch (ADR-139)',
        enabled: true,
        updatedBy: req.user.id,
      },
      update: { enabled: true, updatedBy: req.user.id },
    });
    await prisma.recruitChannelEvent.create({ data: { type: 'RESUMED', actorId: req.user.id } });
    res.json({ ok: true });
  } catch (err) {
    fail(res, 'resume', err);
  }
});

export default router;
