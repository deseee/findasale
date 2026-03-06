// Organizer Weekly Digest Job
// Runs every Monday at 8 AM — sends organizers a digest of their performance
// (item sales, revenue, new followers, top categories)

import cron from 'node-cron';
import { sendOrganizerWeeklyDigest } from '../services/organizerAnalyticsService';

cron.schedule('0 8 * * 1', async () => {
  console.log('📧 Running organizer weekly digest job...');
  try {
    await sendOrganizerWeeklyDigest();
  } catch (err) {
    console.error('Organizer weekly digest job failed:', err);
  }
});
