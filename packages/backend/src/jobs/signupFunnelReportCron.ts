import cron from 'node-cron';
import { cronGuard } from '../utils/cronGuard';
import { getSignupFunnel, formatFunnelWeek } from '../services/signupFunnelService';

/**
 * 2026-11-19: weekly organizer signup funnel report.
 * Mondays 13:00 UTC (8 or 9 AM Detroit). Logs the week that just ended, the week before it
 * for comparison, and the claim review queue, so the numbers can be read from Railway logs
 * by searching "[SignupFunnel]". Read-only; sends nothing.
 */
cron.schedule('0 13 * * 1', cronGuard({ jobName: 'signupFunnelReport' }, async () => {
  const funnel = await getSignupFunnel(3);
  const [current, lastWeek, weekBefore] = funnel.weeks;
  console.log(`[SignupFunnel] last full ${formatFunnelWeek(lastWeek)}`);
  console.log(`[SignupFunnel] prior ${formatFunnelWeek(weekBefore)}`);
  console.log(`[SignupFunnel] this week so far ${formatFunnelWeek(current)}`);
  console.log(
    `[SignupFunnel] claim queue awaitingReview=${funnel.claimQueue.awaitingReview} oldestWaitingSince=${funnel.claimQueue.oldestWaitingSince ?? 'none'}`,
  );
}));
