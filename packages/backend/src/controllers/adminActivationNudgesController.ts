/**
 * Admin: organizer activation nudges log + dry run (2026-10-23).
 *
 * GET /api/admin/activation-nudges
 *   log:     the last 200 activation-nudge EmailAutomationLog rows (sent and suppressed, plus the
 *            pre-2026-10-23 per-sale nudge keys), newest first, with the organizer email and sale title.
 *   preview: what the next organizerOnboardingDrip run would do for every candidate sale
 *            (planActivationNudges: reads only, never sends), and counts by state.
 *   bulkEmailEnabled: whether the daily job is switched on (BULK_EMAIL_ENABLED).
 * Admin only (routes/admin.ts applies authenticate + requireAdmin to the whole router).
 */
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { bulkEmailEnabled } from '../utils/bulkEmailGate';

export const getActivationNudges = async (_req: AuthRequest, res: Response) => {
  try {
    const { ACTIVATION_ANY_KEY_FILTER, parseActivationKey, planActivationNudges } = await import(
      '../jobs/organizerOnboardingDripJob'
    );

    const rows = await prisma.emailAutomationLog.findMany({
      where: ACTIVATION_ANY_KEY_FILTER,
      orderBy: { sentAt: 'desc' },
      take: 200,
      select: { id: true, automationKey: true, sentAt: true, user: { select: { id: true, email: true, name: true } } },
    });
    const parsed = rows.map((r) => ({ row: r, key: parseActivationKey(r.automationKey) }));
    const saleIds = Array.from(new Set(parsed.map((p) => p.key?.saleId).filter((v): v is string => !!v)));
    const sales = saleIds.length
      ? await prisma.sale.findMany({ where: { id: { in: saleIds } }, select: { id: true, title: true, status: true } })
      : [];
    const saleById = new Map(sales.map((s) => [s.id, s]));

    const log = parsed.map(({ row, key }) => ({
      id: row.id,
      sentAt: row.sentAt,
      email: row.user?.email ?? null,
      name: row.user?.name ?? null,
      state: key?.state ?? null,
      outcome: key?.outcome ?? null,
      saleId: key?.saleId ?? null,
      saleTitle: key?.saleId ? saleById.get(key.saleId)?.title ?? null : null,
      saleStatus: key?.saleId ? saleById.get(key.saleId)?.status ?? null : null,
      automationKey: row.automationKey,
    }));

    const decisions = await planActivationNudges();
    const preview = decisions.map((d) => ({
      state: d.state,
      decision: d.decision,
      reason: d.reason,
      saleId: d.saleId,
      saleTitle: d.saleTitle,
      saleStatus: d.saleStatus,
      endDate: d.endDate,
      itemCount: d.itemCount,
      email: d.email,
      name: d.name,
    }));
    const wouldSendByState = { EMPTY_PUBLISHED: 0, DRAFT_UNPUBLISHED: 0, STALE_DATES: 0 } as Record<string, number>;
    for (const d of decisions) if (d.decision === 'send') wouldSendByState[d.state] = (wouldSendByState[d.state] ?? 0) + 1;

    res.json({ bulkEmailEnabled: bulkEmailEnabled(), log, preview, wouldSendByState });
  } catch (error) {
    console.error('[admin] activation nudges failed:', error);
    res.status(500).json({ message: 'Could not load activation nudges' });
  }
};
