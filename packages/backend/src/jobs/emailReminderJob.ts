import cron from 'node-cron';
import { processReminderEmails } from '../services/emailReminderService';
import { cronGuard } from '../utils/cronGuard';

// Run every hour to check for upcoming sales
cron.schedule('6 * * * *', cronGuard({ jobName: 'emailReminderJob' }, async () => { // staggered off saleAutoCloseCron's 0 * * * * 2026-08-04 cost-optimization batch
  console.log('Running email reminder job...');
  await processReminderEmails();
  console.log('Email reminder job completed successfully');
}));
