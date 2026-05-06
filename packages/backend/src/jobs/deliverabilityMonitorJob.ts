import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';

/**
 * deliverabilityMonitorJob.ts — Weekly email deliverability audit
 *
 * Monitors bounce and complaint rates over the last 7 days.
 * Alerts if bounce rate exceeds 2% (industry standard is <1%, but >2% is critical).
 *
 * Runs: Every Sunday at 19:00 UTC
 */

// Weekly Sunday 19:00 UTC
cron.schedule('0 19 * * 0', cronGuard({ jobName: 'deliverabilityMonitor' }, async () => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Count email suppressions (bounces + complaints) in the last 7 days
  const recentSuppressions = await prisma.emailSuppression.count({
    where: { suppressedAt: { gte: sevenDaysAgo } },
  });

  // Count successful sends in the last 7 days
  const recentSent = await prisma.outreachAuditLog.count({
    where: {
      createdAt: { gte: sevenDaysAgo },
      event: 'SENT',
    },
  });

  // Calculate bounce rate
  if (recentSent > 0) {
    const bounceRate = recentSuppressions / recentSent;
    const bouncePercentage = (bounceRate * 100).toFixed(1);

    console.log(
      `[deliverability] Weekly check: ${recentSent} sent, ${recentSuppressions} bounced/suppressed (${bouncePercentage}%)`
    );

    // Alert if bounce rate exceeds 2%
    if (bounceRate > 0.02) {
      const alertMsg = `⚠️ High bounce rate: ${bouncePercentage}% (${recentSuppressions}/${recentSent}) — exceeds 2% threshold`;
      console.warn(`[deliverability:alert] ${alertMsg}`);
      // TODO: send alert email via existing email service (e.g., Resend, Nodemailer)
    }
  } else {
    console.log('[deliverability] Weekly check: no sends in last 7 days');
  }
}));
