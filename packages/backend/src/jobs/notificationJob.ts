import cron from 'node-cron';
import { sendWeeklyDigest } from '../controllers/notificationController';
import { cronGuard } from '../utils/cronGuard';
import { bulkEmailEnabled } from '../utils/bulkEmailGate';

// Run every Friday at 9 AM
cron.schedule('0 9 * * 5', cronGuard({ jobName: 'notificationJob' }, async () => {
  if (!bulkEmailEnabled()) { console.log('[notificationJob] Skipped — bulk email disabled (OUTREACH_ENABLED!=true)'); return; }
  console.log('Running weekly digest job...');
  await sendWeeklyDigest();
  console.log('Weekly digest job completed successfully');
}));
