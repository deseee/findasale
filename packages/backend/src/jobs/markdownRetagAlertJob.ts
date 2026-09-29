/**
 * Markdown Re-tag Alert (2026-09-29, Patrick): "how do we get alerts setup ... so staff can
 * change tags or sticker/highlight them to indicate they are 10/20/30% off".
 *
 * The staff list already exists (/organizer/markdown-retag, fed by Item.markdownApplied = true
 * AND markdownPhysicallyAppliedAt = null). What was missing is a PUSH: nobody was told the list
 * had grown. Once a day (before the shop opens) this job sends each organizer with items still
 * waiting on a physical re-tag one in-app notification + email summarising how many need which
 * sticker, linking straight to the list. Reads the queue itself rather than hooking the markdown
 * crons, so it also covers direct price corrections and never touches money-affecting code.
 *
 * Safety (May 2026 digest incident lessons): only organizers that actually have queued items are
 * contacted, one message per organizer per day, fused at MAX_RECIPIENTS, kill switch
 * MARKDOWN_RETAG_ALERT_ENABLED=false.
 */
import cron from 'node-cron';
import { prisma } from '../index';
import { cronGuard } from '../utils/cronGuard';
import { createNotification } from '../lib/notificationService';
import { loadStickerContext, resolveStickerPct } from '../utils/markdownSticker';

const MAX_RECIPIENTS = 25;

export async function runMarkdownRetagAlert(): Promise<{ organizers: number; notified: number }> {
  const groups = await prisma.item.groupBy({
    by: ['organizerId'],
    where: {
      organizerId: { not: null },
      markdownApplied: true,
      markdownPhysicallyAppliedAt: null,
      status: { in: ['AVAILABLE', 'RESERVED'] },
      deletedAt: null,
    },
    _count: { _all: true },
  });

  if (groups.length === 0) return { organizers: 0, notified: 0 };
  if (groups.length > MAX_RECIPIENTS) {
    console.error(`[markdownRetagAlert] ${groups.length} organizers queued (> fuse ${MAX_RECIPIENTS}) -- aborting without sending`);
    return { organizers: groups.length, notified: 0 };
  }

  let notified = 0;
  for (const g of groups) {
    if (!g.organizerId) continue;
    try {
      const organizer = await prisma.organizer.findUnique({
        where: { id: g.organizerId },
        select: { userId: true, subscriptionTier: true },
      });
      if (!organizer?.userId) continue;
      // Markdown Re-tag List is a PRO feature (page + endpoints are gated), so do not email a link to a wall.
      if ((organizer.subscriptionTier ?? 'SIMPLE') === 'SIMPLE') continue;

      const [items, ctx] = await Promise.all([
        prisma.item.findMany({
          where: {
            organizerId: g.organizerId,
            markdownApplied: true,
            markdownPhysicallyAppliedAt: null,
            status: { in: ['AVAILABLE', 'RESERVED'] },
            deletedAt: null,
          },
          select: {
            price: true,
            priceBeforeMarkdown: true,
            saleId: true,
            markdownStepIndexApplied: true,
            markdownTierApplied: true,
          },
        }),
        loadStickerContext(g.organizerId),
      ]);

      const byPct = new Map<number, number>();
      for (const it of items) {
        const pct = resolveStickerPct(it, ctx) ?? 0;
        byPct.set(pct, (byPct.get(pct) ?? 0) + 1);
      }
      const breakdown = [...byPct.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([pct, n]) => (pct > 0 ? `${n} at ${pct}% off` : `${n} marked down`))
        .join(', ');
      const total = items.length;

      await createNotification({
        userId: organizer.userId,
        type: 'MARKDOWN_RETAG',
        title: `${total} item${total === 1 ? '' : 's'} need a new price tag`,
        body: `${total} marked-down item${total === 1 ? ' is' : 's are'} still waiting on a shelf re-tag: ${breakdown}. Open the list, re-tag or sticker them, and tick them off.`,
        link: '/organizer/markdown-retag',
        sendEmail: true,
        emailSubject: `${total} item${total === 1 ? '' : 's'} need re-tagging (${breakdown})`,
      });
      notified += 1;
    } catch (err) {
      console.error(`[markdownRetagAlert] failed for organizer ${g.organizerId}:`, err);
    }
  }
  return { organizers: groups.length, notified };
}

export function scheduleMarkdownRetagAlertJob(): void {
  if (process.env.MARKDOWN_RETAG_ALERT_ENABLED === 'false') {
    console.log('[markdownRetagAlert] MARKDOWN_RETAG_ALERT_ENABLED=false -- skipping cron registration');
    return;
  }
  // 13:20 UTC daily = 9:20 AM EDT / 8:20 AM EST -- lands before a downtown shop opens, and off
  // the :00/:30 marks other jobs use.
  cron.schedule('20 13 * * *', cronGuard({ jobName: 'markdownRetagAlertJob' }, async () => {
    const r = await runMarkdownRetagAlert();
    if (r.organizers > 0) console.log(`[markdownRetagAlert] notified ${r.notified}/${r.organizers} organizers`);
  }));
  console.log('[markdownRetagAlert] Registered daily re-tag alert (13:20 UTC)');
}
