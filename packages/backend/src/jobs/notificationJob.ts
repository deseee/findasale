import cron from 'node-cron';
import { sendWeeklyDigest } from '../controllers/notificationController';

// Run every Friday at 9 AM
cron.schedule('0 9 * * 5', async () => {
  console.log('Running weekly digest job...');
  try {
    await sendWeeklyDigest();
    console.log('Weekly digest job completed successfully');
  } catch (error) {
    console.error('Weekly digest job failed:', error);
  }
});
