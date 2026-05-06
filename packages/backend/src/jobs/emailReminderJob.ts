import cron from 'node-cron';
import { processReminderEmails } from '../services/emailReminderService';
import { cronGuard } from '../utils/cronGuard';

// Run every hour to check for upcoming sales
cron.schedule('0 * * * *', cronGuard({ jobName: 'emailReminderJob' }, async () => {
  console.log('Running email reminder job...');
  await processReminderEmails();
  console.log('Email reminder job completed successfully');
}));
