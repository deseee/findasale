import cron from 'node-cron';
import { cronGuard } from '../utils/cronGuard';
import { notifyMeSenderEnabled, notifyMeDryRun, runNotifyMeSender } from '../services/notifyMeSenderService';

/**
 * Shopper Notify Me sender cron (Feature #455) - every 2 hours at :17.
 *
 * OFF BY DEFAULT. Nothing is matched or sent unless the Railway env var
 * NOTIFY_ME_SENDER_ENABLED is exactly "true". Optional knobs (all safe defaults):
 *   NOTIFY_ME_DRY_RUN=true                 compute + log matches, claim nothing, send nothing
 *   NOTIFY_ME_MAX_EMAILS_PER_RUN=50        hard per-run fuse (1..500)
 *   NOTIFY_ME_MAX_TARGETS_PER_RUN=300      max Notify Me entries examined per run
 *   NOTIFY_ME_UNSUB_SECRET=<secret>        HMAC secret for unsubscribe links (falls back to JWT_SECRET)
 *
 * Recommended rollout: NOTIFY_ME_SENDER_ENABLED=true + NOTIFY_ME_DRY_RUN=true, read the
 * "[notifyMeSender] Run summary" log lines, then unset NOTIFY_ME_DRY_RUN.
 * Sends go through the Resend transactional rail, not the Gmail outreach account.
 */
export function scheduleNotifyMeSenderCron(): void {
  cron.schedule(
    '17 */2 * * *',
    cronGuard({ jobName: 'notifyMeSenderJob' }, async () => {
      if (!notifyMeSenderEnabled()) {
        console.log('[notifyMeSenderJob] Skipped - NOTIFY_ME_SENDER_ENABLED is not "true"');
        return;
      }
      console.log(`[notifyMeSenderJob] Starting run${notifyMeDryRun() ? ' (DRY RUN)' : ''}...`);
      await runNotifyMeSender();
      console.log('[notifyMeSenderJob] Completed.');
    })
  );
  console.log('[notifyMeSenderJob] Registered cron (every 2h at :17; inert unless NOTIFY_ME_SENDER_ENABLED=true)');
}
