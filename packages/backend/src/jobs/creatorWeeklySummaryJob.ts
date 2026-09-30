import cron from 'node-cron';
import { cronGuard } from '../utils/cronGuard';
import { sendCreatorWeeklySummaries } from '../services/creatorAffiliateService';

/**
 * Creator program weekly summary (2026-09-29).
 * Mondays 15:07 UTC. Sends each creator who opted in (CreatorProfile.notifyWeeklySummary) one
 * in-app notification covering the last 7 days of link clicks, attributed purchases and commission.
 * Quiet weeks send nothing. Backs the "Weekly summary" toggle on the creator dashboard settings tab.
 */
export function scheduleCreatorWeeklySummaryJob() {
  cron.schedule('7 15 * * 1', cronGuard({ jobName: 'creatorWeeklySummaryJob' }, async () => {
    try {
      const { sent } = await sendCreatorWeeklySummaries();
      console.log(`[creatorWeeklySummaryJob] sent ${sent} summaries`);
    } catch (err) {
      console.error('[creatorWeeklySummaryJob] failed:', err);
    }
  }));
}
