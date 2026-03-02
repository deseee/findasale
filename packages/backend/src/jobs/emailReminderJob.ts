import cron from 'node-cron';
import { processReminderEmails } from '../services/emailReminderService';

// Run every hour to check for upcoming sales
cron.schedule('0 * * * *', async () => {
  console.log('Running email reminder job...');
  try {
    await processReminderEmails();
    console.log('Email reminder job completed successfully');
  } catch (error) {
    console.error('Email reminder job failed:', error);
  }
});
