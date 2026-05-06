// Organizer Weekly Digest Job
// Runs every Monday at 8 AM — sends organizers a digest of their performance
// (item sales, revenue, new followers, top categories)

import cron from 'node-cron';
import { sendOrganizerWeeklyDigest } from '../services/organizerAnalyticsService';
import { cronGuard } from '../utils/cronGuard';

cron.schedule('0 9 * * 1', cronGuard({ jobName: 'organizerWeeklyDigestJob' }, async () => {
  console.log('📧 Running organizer weekly digest job...');
  await sendOrganizerWeeklyDigest();
}));
