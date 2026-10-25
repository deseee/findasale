import cron from 'node-cron';
import { sendWeeklyDigest } from '../controllers/notificationController';
import { cronGuard } from '../utils/cronGuard';
import { bulkEmailEnabled } from '../utils/bulkEmailGate';

// Weekly digest: Friday 9 AM, plus Saturday and Sunday 9 AM catch-up runs (2026-10-25).
// The digest goes out on the Google Workspace Gmail rail (2026-10-25 decision: no Resend Pro). Gmail's
// daily quota guard (GMAIL_DAILY_HARD_LIMIT) can stop a large edition mid-run, so the Saturday and
// Sunday runs resume it. sendWeeklyDigest marks each recipient per edition (EmailAutomationLog
// 'weekly_digest:<Friday date>'), so the weekend runs send only to the remainder and are a
// no-op when nothing is pending.
cron.schedule('0 9 * * 5,6,0', cronGuard({ jobName: 'notificationJob' }, async () => {
  if (!bulkEmailEnabled()) { console.log('[notificationJob] Skipped — bulk email disabled (BULK_EMAIL_ENABLED!=true)'); return; }
  console.log('Running weekly digest job...');
  await sendWeeklyDigest();
  console.log('Weekly digest job completed successfully');
}));
