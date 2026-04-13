// CD2 Phase 2: Weekly personalized email for shoppers
// Runs every Sunday at 6 PM — sends curated items based on purchase/browse history

import cron from 'node-cron';
import { sendWeeklyEmails } from '../services/weeklyEmailService';

// Run every Sunday at 6 PM: cron.schedule('minute hour day-of-month month day-of-week', ...)
// Sunday = 0, Monday = 1, ... Saturday = 6
cron.schedule('0 18 * * 0', async () => {
  console.log('[Cron] Running weekly shopper email job (Sunday 6pm)...');
  try {
    await sendWeeklyEmails();
    console.log('[Cron] Weekly shopper email job completed successfully');
  } catch (error) {
    console.error('[Cron] Weekly shopper email job failed:', error);
  }
});
