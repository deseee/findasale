import cron from 'node-cron';
import { sendWeeklyDigest } from '../controllers/notificationController';
import { cronGuard } from '../utils/cronGuard';

// Run every Friday at 9 AM
cron.schedule('0 9 * * 5', cronGuard({ jobName: 'notificationJob' }, async () => {
  console.log('Running weekly digest job...');
  await sendWeeklyDigest();
  console.log('Weekly digest job completed successfully');
}));
