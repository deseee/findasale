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
      const alertRecipient = process.env.QUOTA_ALERT_EMAIL;
      if (!apiKey) {
        console.error('[deliverability] RESEND_API_KEY not set — cannot send bounce alert');
      } else if (!alertRecipient) {
        console.error('[deliverability] QUOTA_ALERT_EMAIL not set — cannot send bounce alert');
      } else {
        try {
          const resend = new Resend(apiKey);
          await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL || 'FindA.Sale Alerts <alerts@finda.sale>',
            to: alertRecipient,
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
          console.log(`[deliverability] Bounce alert sent to ${alertRecipient}`);
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

/**
 * runSpamBlockTripwire — immediate alert on any explicit provider-side spam-block
 * signal, independent of the weekly rate check above.
 *
 * Added 2026-09-06 after an email-deliverability audit (see
 * claude_docs/audits/email-deliverability-audit-2026-09-06.md) found that the
 * weekly check above only measures volume via OutreachAuditLog (the cold-outreach
 * pipeline) — it has zero visibility into the Resend transactional rail
 * (refunds/receipts/password-resets/payouts/invoices) or the non-outreach Gmail
 * bulk jobs. A real Gmail SMTP hard rejection ("550 5.7.1 ... likely unsolicited
 * mail ... blocked") already happened 2026-08-18 and was not reliably caught by
 * the weekly rate check. This tripwire runs every 6 hours and fires on ANY new
 * EmailSuppression row that looks like an explicit spam-block (not just a bounce),
 * regardless of overall send volume or rate.
 */
export async function runSpamBlockTripwire(): Promise<void> {
  const windowStart = new Date(Date.now() - 6 * 60 * 60 * 1000);

  const flagged = await prisma.emailSuppression.findMany({
    where: {
      createdAt: { gte: windowStart },
      OR: [
        { suppressionReason: 'POLICY_BLOCK' },
        { diagnosticCode: { contains: 'unsolicited', mode: 'insensitive' } },
        { diagnosticCode: { contains: 'spam', mode: 'insensitive' } },
        { diagnosticCode: { contains: 'blocked', mode: 'insensitive' } },
      ],
    },
    select: {
      emailAddress: true,
      suppressionReason: true,
      diagnosticCode: true,
      bounceCategory: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 25,
  });

  if (flagged.length === 0) {
    console.log('[deliverability:tripwire] 6h check: no spam-block signals found');
    return;
  }

  console.warn(`[deliverability:tripwire] ${flagged.length} spam-block signal(s) in the last 6h`);

  const apiKey = process.env.RESEND_API_KEY;
  const alertRecipient = process.env.QUOTA_ALERT_EMAIL;
  if (!apiKey) {
    console.error('[deliverability:tripwire] RESEND_API_KEY not set — cannot send alert');
    return;
  }
  if (!alertRecipient) {
    console.error('[deliverability:tripwire] QUOTA_ALERT_EMAIL not set — cannot send alert');
    return;
  }

  // Domain only in the alert body — avoids putting a full recipient address into an
  // internal alert email for a signal that's actionable at the domain/reputation level.
  const domainOf = (addr: string): string => addr.split('@')[1] || addr;

  const rows = flagged
    .map(f => {
      const diag = (f.diagnosticCode || '').slice(0, 200).replace(/</g, '&lt;');
      return `<li><strong>${domainOf(f.emailAddress)}</strong> — ${f.suppressionReason || f.bounceCategory || 'unknown'} @ ${f.createdAt.toISOString()}${diag ? `<br><code style="font-size:11px">${diag}</code>` : ''}</li>`;
    })
    .join('');

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'FindA.Sale Alerts <alerts@finda.sale>',
      to: alertRecipient,
      subject: `\u{1F6A8} Spam-block signal detected (${flagged.length} in last 6h)`,
      html: `
        <p><strong>\u{1F6A8} A mailbox provider explicitly flagged FindA.Sale mail as spam/unsolicited in the last 6 hours.</strong></p>
        <ul>${rows}</ul>
        <p>This fires independent of the weekly bounce-rate check, which only tracks outreach-pipeline volume and would not reliably catch this. See claude_docs/audits/email-deliverability-audit-2026-09-06.md for background.</p>
        <p style="color:#666;font-size:12px">FindA.Sale \u00b7 deliverabilityMonitorJob.ts \u00b7 every 6h</p>
      `,
    });
    console.log(`[deliverability:tripwire] Alert sent to ${alertRecipient}`);
  } catch (err) {
    console.error('[deliverability:tripwire] Failed to send alert via Resend:', err);
  }
}

// Spam-block tripwire — every 6 hours (independent of the weekly rate check above)
cron.schedule('0 */6 * * *', cronGuard({ jobName: 'deliverabilitySpamTripwire' }, runSpamBlockTripwire));

