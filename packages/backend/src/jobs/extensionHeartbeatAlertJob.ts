/**
 * Extension heartbeat alert (2026-10-26). When the organizer's Chrome sign-in to finda.sale expires, the browser
 * extension cannot authenticate, every auto queue poll fails on the extension side, and nothing is posted -- silently
 * (live 2026-10-25 15:58 onward). The extension now shows its own "Sign in to FindA.Sale" badge, but that is only seen
 * by someone looking at Chrome. This job is the server-side signal: once an hour it finds organizers with any auto queue
 * switch on whose extension has polled before but has not polled successfully for over 24 hours, and sends ONE in-app
 * notification (and email) per silence. The next successful poll re-arms it (services/extensionHeartbeat.ts).
 *
 * Safety: only organizers with a switch on and a stale heartbeat are contacted, at most one message per silence, fused
 * on real recipients (default 25, EXTENSION_HEARTBEAT_ALERT_MAX_RECIPIENTS), kill switch
 * EXTENSION_HEARTBEAT_ALERT_ENABLED=false.
 */
import cron from 'node-cron';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import { createNotification } from '../lib/notificationService';
import { AUTO_QUEUE_FLAG_BY_PLATFORM } from '../services/autoQueueSettings';
import { loadExtensionHeartbeats, shouldAlertHeartbeat } from '../services/extensionHeartbeat';

const DEFAULT_MAX_RECIPIENTS = 25;
function maxRecipients(): number {
  const n = parseInt(process.env.EXTENSION_HEARTBEAT_ALERT_MAX_RECIPIENTS ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_RECIPIENTS;
}

export const EXTENSION_SILENT_TITLE = 'Your FindA.Sale browser extension stopped checking in';
export const EXTENSION_SILENT_BODY =
  'Auto queue is on, but the browser extension has not checked in for over 24 hours, so nothing new is being queued or posted. ' +
  'This usually means you were signed out of finda.sale in Chrome. Open Chrome, sign in at finda.sale, and the extension picks up again on its own.';
export const EXTENSION_SILENT_LINK = '/organizer/marketplace-extension#auto-queue';

export async function runExtensionHeartbeatAlert(now: number = Date.now()): Promise<{ candidates: number; notified: number }> {
  const flagOr = Object.values(AUTO_QUEUE_FLAG_BY_PLATFORM).map((f) => ({ [f]: true }));
  const organizers = await prisma.organizer.findMany({
    where: { OR: flagOr as Prisma.OrganizerWhereInput[] },
    select: { id: true, userId: true },
  });
  if (!organizers.length) return { candidates: 0, notified: 0 };
  const heartbeats = await loadExtensionHeartbeats(organizers.map((o) => o.id));
  const due = organizers.filter((o) => {
    const hb = heartbeats.get(o.id);
    return !!o.userId && !!hb && shouldAlertHeartbeat(hb.record, true, now);
  });
  if (!due.length) return { candidates: 0, notified: 0 };
  const fuse = maxRecipients();
  if (due.length > fuse) {
    console.error(`[extensionHeartbeatAlert] ${due.length} recipients (> fuse ${fuse}) -- aborting without sending`);
    return { candidates: due.length, notified: 0 };
  }
  let notified = 0;
  for (const o of due) {
    const hb = heartbeats.get(o.id)!;
    try {
      await createNotification({
        userId: o.userId,
        type: 'EXTENSION_SILENT',
        title: EXTENSION_SILENT_TITLE,
        body: EXTENSION_SILENT_BODY,
        link: EXTENSION_SILENT_LINK,
        sendEmail: true,
        emailSubject: EXTENSION_SILENT_TITLE,
      });
      // Mark this silence as alerted without touching createdAt (= last successful poll).
      const ctx = (hb.context && typeof hb.context === 'object' ? hb.context : {}) as Record<string, unknown>;
      await prisma.extensionRuntimeLog.update({
        where: { id: hb.id },
        data: { context: { ...ctx, alertedAt: new Date(now).toISOString() } as unknown as Prisma.InputJsonValue },
      });
      notified += 1;
    } catch (err) {
      console.error(`[extensionHeartbeatAlert] failed for organizer ${o.id}:`, err);
    }
  }
  return { candidates: due.length, notified };
}

export function scheduleExtensionHeartbeatAlertJob(): void {
  if (process.env.EXTENSION_HEARTBEAT_ALERT_ENABLED === 'false') {
    console.log('[extensionHeartbeatAlert] EXTENSION_HEARTBEAT_ALERT_ENABLED=false -- skipping cron registration');
    return;
  }
  // Hourly at :17 (off the :00/:30 marks other jobs use).
  cron.schedule('17 * * * *', cronGuard({ jobName: 'extensionHeartbeatAlertJob' }, async () => {
    const r = await runExtensionHeartbeatAlert();
    if (r.candidates > 0) console.log(`[extensionHeartbeatAlert] notified ${r.notified}/${r.candidates} organizers`);
  }));
  console.log('[extensionHeartbeatAlert] Registered hourly extension heartbeat alert (:17)');
}
