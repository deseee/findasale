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
 * contacted, one message per organizer per day, fused on the number of real recipients
 * (default 25, MARKDOWN_RETAG_ALERT_MAX_RECIPIENTS), kill switch MARKDOWN_RETAG_ALERT_ENABLED=false.
 * All tiers are alerted (Patrick D3, 2026-09-29): the free-tier markdownCron feeds the same list.
 */
import cron from 'node-cron';
import { prisma } from '../index';
import { cronGuard } from '../utils/cronGuard';
import { createNotification } from '../lib/notificationService';
import { loadStickerContext, resolveStickerPct } from '../utils/markdownSticker';

// Fuse on REAL recipients (organizers that will actually be contacted). Default 25; raise with
// MARKDOWN_RETAG_ALERT_MAX_RECIPIENTS now that every tier is alerted (2026-09-29).
const DEFAULT_MAX_RECIPIENTS = 25;
function maxRecipients(): number {
  const n = parseInt(process.env.MARKDOWN_RETAG_ALERT_MAX_RECIPIENTS ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_RECIPIENTS;
}

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

  // Resolve every queued organizer to its owner user BEFORE applying the fuse, so the fuse
  // counts organizers that will really be contacted. (It used to count queued organizers that
  // were then skipped.) 2026-09-29 (Patrick D3): the Re-tag list is free for every tier, so
  // every organizer with queued items is alerted regardless of subscription tier. The alert goes
  // to the organizer (owner) only; staff alerts are not in scope.
  const queuedIds = groups.map((g) => g.organizerId).filter((id): id is string => !!id);
  const organizerRows = await prisma.organizer.findMany({
    where: { id: { in: queuedIds } },
    select: { id: true, userId: true },
  });
  const userIdByOrganizer = new Map<string, string>();
  for (const o of organizerRows) {
    if (o.userId) userIdByOrganizer.set(o.id, o.userId);
  }
  const recipients = groups.filter((g) => g.organizerId && userIdByOrganizer.has(g.organizerId));

  if (recipients.length === 0) return { organizers: 0, notified: 0 };
  const fuse = maxRecipients();
  if (recipients.length > fuse) {
    console.error(`[markdownRetagAlert] ${recipients.length} recipients queued (> fuse ${fuse}) -- aborting without sending`);
    return { organizers: recipients.length, notified: 0 };
  }

  let notified = 0;
  for (const g of recipients) {
    if (!g.organizerId) continue;
    const ownerUserId = userIdByOrganizer.get(g.organizerId);
    if (!ownerUserId) continue;
    try {
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
        userId: ownerUserId,
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
  return { organizers: recipients.length, notified };
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
