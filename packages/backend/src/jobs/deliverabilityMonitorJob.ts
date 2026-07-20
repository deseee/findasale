import cron from 'node-cron';
import { Resend } from 'resend';
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

/** Core deliverability check logic — exported so it can be added to JOB_MAP. */
export async function runDeliverabilityMonitor(): Promise<void> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Count email suppressions (bounces + complaints) in the last 7 days
  // Exclude COMPETITOR_DOMAIN entries — proactive domain blocks, not real mail bounces.
  // Counting them inflates the reported bounce rate and fires false-positive alerts.
  const recentSuppressions = await prisma.emailSuppression.count({
    where: {
      // Use createdAt (true bounce-event time), NOT suppressedAt/updatedAt - those get
      // re-touched by the daily reclassify-bounces backfill and bounceSuppressService
      // re-processing, which re-dates old bounces into the "recent" window and inflates
      // this alert (confirmed 2026-07-20: a 07-19 alert reported 4.4%/4 bounces when the
      // true createdAt-basis rate was 2.2%/2 - two 07-10 bounces were double-counted after
      // a 07-13 backfill touched their suppressedAt). See CLAUDE.md D2 INCIDENT LOG.
      createdAt: { gte: sevenDaysAgo },
      suppressionReason: { not: 'COMPETITOR_DOMAIN' },
    },
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

      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        console.error('[deliverability] RESEND_API_KEY not set — cannot send bounce alert');
      } else {
        try {
          const resend = new Resend(apiKey);
          await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL || 'FindA.Sale Alerts <alerts@finda.sale>',
            to: process.env.QUOTA_ALERT_EMAIL || '***REDACTED-ADMIN-EMAIL***',
            subject: `⚠️ High bounce rate: ${bouncePercentage}% (${recentSuppressions}/${recentSent})`,
            html: `
              <p><strong>⚠️ WARNING:</strong> The outreach bounce rate over the last 7 days has exceeded the 2% threshold.</p>
              <ul>
                <li><strong>Bounce rate:</strong> ${bouncePercentage}%</li>
                <li><strong>Suppressions (bounces + complaints):</strong> ${recentSuppressions}</li>
                <li><strong>Total sent:</strong> ${recentSent}</li>
              </ul>
              <p>High bounce rates risk Gmail account suspension and inbox deliverability. Review recent sends and suppress problematic addresses.</p>
              <p style="color:#666;font-size:12px">FindA.Sale · deliverabilityMonitorJob.ts · weekly Sunday 19:00 UTC</p>
            `,
          });
          console.log(`[deliverability] Bounce alert sent to ${process.env.QUOTA_ALERT_EMAIL || '***REDACTED-ADMIN-EMAIL***'}`);
        } catch (err) {
          console.error('[deliverability] Failed to send bounce alert via Resend:', err);
        }
      }
    }
  } else {
    console.log('[deliverability] Weekly check: no sends in last 7 days');
  }
}

// Weekly Sunday 19:00 UTC
cron.schedule('0 19 * * 0', cronGuard({ jobName: 'deliverabilityMonitor' }, runDeliverabilityMonitor));
