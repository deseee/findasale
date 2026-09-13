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

/**
 * Cross-rail SENT volume for the last 7 days.
 *
 * Root cause (P1, claude_docs/audits/email-deliverability-audit-2026-09-06.md
 * Sec.6 recommendation 1a): the bounce-rate denominator used to be
 * OutreachAuditLog "SENT" alone, which only tracks the cold-organizer-outreach
 * pipeline. The Resend transactional rail (refunds/receipts/password-resets/
 * payouts/invoices) and the Gmail bulk/marketing rail had zero visibility —
 * either understating the true bounce rate or, when outreach volume was
 * low/zero, skipping the check entirely while thousands of other emails went
 * out. The numerator (recentSuppressions in runDeliverabilityMonitor below)
 * was already rail-agnostic (a plain EmailSuppression count with no rail
 * filter) — only the denominator needed the fix.
 *
 * Sources, none requiring a new schema field/table:
 *  - Cold outreach: prisma.outreachAuditLog "SENT" count (unchanged, exact
 *    per-event tracking).
 *  - Gmail bulk/marketing: prisma.emailQuotaLog is the platform-wide daily
 *    Gmail-API send counter, incremented by BOTH emailService.emails.send()
 *    (the ~40 bulk/marketing call sites) AND outreachEmailsCron.ts's own
 *    direct checkAndIncrementQuota() call (packages/backend/src/lib/
 *    emailService.ts:75,319; packages/backend/src/jobs/outreachEmailsCron.ts:792).
 *    prisma.outreachQuotaLog is outreach-only volume on that SAME shared
 *    counter (emailService.ts:159-169) — subtracting it isolates Gmail-bulk-
 *    only sends per day, so this is never double-counted against the
 *    outreachSent figure above. Both are daily-granularity counters (date-
 *    keyed, not per-event), so this is a day-bucket approximation of the
 *    rolling 7-day window, not exact to the second — acceptable for a weekly
 *    trend check.
 *  - Resend transactional: no SENT counter existed for this rail at all.
 *    Added one this session at lib/transactionalEmailService.ts's single
 *    shared send() call site (the only Resend send call site in the backend
 *    used for customer mail — lib/emailService.ts's own `new Resend(...)`
 *    calls are internal ops alerts only, never customer sends), using the
 *    already-existing generic ApiUsageLog table (service+dateKey+callCount —
 *    "resend" was already listed as an example service value in that model's
 *    own schema.prisma comment) via the existing recordApiUsage() helper.
 */
async function getCrossRailSentCounts(sevenDaysAgo: Date): Promise<{
  outreachSent: number;
  gmailBulkSent: number;
  resendSent: number;
  totalSent: number;
}> {
  const earliestDateKey = sevenDaysAgo.toISOString().slice(0, 10); // YYYY-MM-DD

  const [outreachSent, emailQuotaRows, outreachQuotaRows, resendUsageRows] = await Promise.all([
    prisma.outreachAuditLog.count({
      where: { createdAt: { gte: sevenDaysAgo }, event: 'SENT' },
    }),
    prisma.emailQuotaLog.findMany({
      where: { date: { gte: earliestDateKey } },
      select: { count: true },
    }),
    prisma.outreachQuotaLog.findMany({
      where: { date: { gte: earliestDateKey } },
      select: { count: true },
    }),
    prisma.apiUsageLog.findMany({
      where: { service: 'resend:transactional', dateKey: { gte: earliestDateKey } },
      select: { callCount: true },
    }),
  ]);

  const emailQuotaTotal = emailQuotaRows.reduce((sum, r) => sum + r.count, 0);
  const outreachQuotaTotal = outreachQuotaRows.reduce((sum, r) => sum + r.count, 0);
  // Floor at 0 — same-day timing skew between the two shared-counter writes
  // should never push this negative.
  const gmailBulkSent = Math.max(0, emailQuotaTotal - outreachQuotaTotal);

  const resendSent = resendUsageRows.reduce((sum, r) => sum + r.callCount, 0);

  return {
    outreachSent,
    gmailBulkSent,
    resendSent,
    totalSent: outreachSent + gmailBulkSent + resendSent,
  };
}

/** Core deliverability check logic — exported so it can be added to JOB_MAP. */
export async function runDeliverabilityMonitor(): Promise<void> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Count email suppressions (bounces + complaints) in the last 7 days
  // Exclude COMPETITOR_DOMAIN entries — proactive domain blocks, not real mail bounces.
  // Counting them inflates the reported bounce rate and fires false-positive alerts.
  // Already rail-agnostic — no relatedOrganizerId/resendEventId filter — so only the
  // SENT-side denominator below needed extending to cover every rail.
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

  // Cross-rail SENT volume — see getCrossRailSentCounts() doc comment above.
  const { outreachSent, gmailBulkSent, resendSent, totalSent: recentSent } =
    await getCrossRailSentCounts(sevenDaysAgo);

  // Calculate bounce rate
  if (recentSent > 0) {
    const bounceRate = recentSuppressions / recentSent;
    const bouncePercentage = (bounceRate * 100).toFixed(1);

    console.log(
      `[deliverability] Weekly check: ${recentSent} sent (outreach=${outreachSent}, gmail_bulk=${gmailBulkSent}, resend=${resendSent}), ` +
      `${recentSuppressions} bounced/suppressed (${bouncePercentage}%)`
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
              <p><strong>⚠️ WARNING:</strong> The email bounce rate across all sending rails over the last 7 days has exceeded the 2% threshold.</p>
              <ul>
                <li><strong>Bounce rate:</strong> ${bouncePercentage}%</li>
                <li><strong>Suppressions (bounces + complaints, all rails):</strong> ${recentSuppressions}</li>
                <li><strong>Total sent (all rails):</strong> ${recentSent}</li>
                <li style="margin-top:6px"><strong>Sent by rail:</strong> cold-outreach ${outreachSent} · Gmail bulk/marketing ${gmailBulkSent} · Resend transactional ${resendSent}</li>
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
    console.log('[deliverability] Weekly check: no sends in last 7 days (any rail)');
  }
}

// Weekly Sunday 19:00 UTC
cron.schedule('0 19 * * 0', cronGuard({ jobName: 'deliverabilityMonitor' }, runDeliverabilityMonitor));

/**
 * runSpamBlockTripwire — immediate alert on any explicit provider-side spam-block
 * or complaint signal, independent of the weekly rate check above.
 *
 * Added 2026-09-06 after an email-deliverability audit (see
 * claude_docs/audits/email-deliverability-audit-2026-09-06.md) found that the
 * weekly check above only measured volume via OutreachAuditLog (the cold-outreach
 * pipeline) — it had zero visibility into the Resend transactional rail
 * (refunds/receipts/password-resets/payouts/invoices) or the non-outreach Gmail
 * bulk jobs. A real Gmail SMTP hard rejection ("550 5.7.1 ... likely unsolicited
 * mail ... blocked") already happened 2026-08-18 and was not reliably caught by
 * the weekly rate check. The weekly check's denominator was extended 2026-09-08
 * to cover all three rails (see getCrossRailSentCounts() above) — this tripwire
 * still runs independently every 6 hours and fires on ANY new EmailSuppression
 * row that looks like an explicit spam-block (not just a bounce), regardless of
 * overall send volume or rate, since a single 550 5.7.1 is worth a same-day
 * alert on its own rather than waiting for the weekly rate to cross 2%.
 *
 * Cross-rail fix, 2026-09-13 (claude_docs/STATE.md 2026-09-06 P1 blocked-queue
 * row, still open as of this session despite the 2026-09-08 SENT-volume fix
 * above): confirmed by direct code read that the query below only ever matched
 * rows written by the Gmail-rail bounce-mailbox scan
 * (bounceSuppressService.ts), which is the only writer that populated
 * `bounceCategory`/`diagnosticCode` or used the uppercase 'POLICY_BLOCK'
 * `suppressionReason`. The Resend transactional rail's own webhook
 * (routes/outreach.ts's `email.bounced`/`email.complained` handlers) wrote
 * `suppressionReason: 'hard_bounce' | 'soft_bounce' | 'complaint'` (lowercase)
 * and NEVER set `bounceCategory`/`diagnosticCode` at all — so a real Resend-
 * rail hard rejection or spam complaint (the exact "noreply@finda.sale landed
 * in Gmail spam" scenario this row describes) could not trip this tripwire no
 * matter how severe. Fixed at the source instead of here: the Resend webhook
 * handler now classifies its bounce message through the same
 * `classifyDiagnosticKeywords()` keyword rules the Gmail-rail scan uses (see
 * services/bounceSuppressService.ts) and every complaint is unconditionally
 * tagged `bounceCategory:'COMPLAINT'` (see services/suppressionService.ts),
 * so Resend-rail signals now arrive in the SAME fields this query already
 * reads. The `bounceCategory`/uppercase-'COMPLAINT' OR-clauses below are the
 * only change needed here — added, not replacing, the pre-existing clauses.
 */
export async function runSpamBlockTripwire(): Promise<void> {
  const windowStart = new Date(Date.now() - 6 * 60 * 60 * 1000);

  const flagged = await prisma.emailSuppression.findMany({
    where: {
      createdAt: { gte: windowStart },
      OR: [
        { suppressionReason: 'POLICY_BLOCK' },
        { suppressionReason: 'COMPLAINT' },
        // Cross-rail additions (2026-09-13) — catches Resend-rail bounces/
        // complaints now classified via classifyDiagnosticKeywords() /
        // processComplaint(), which set bounceCategory but not necessarily
        // the uppercase suppressionReason values above.
        { bounceCategory: 'POLICY_BLOCK' },
        { bounceCategory: 'COMPLAINT' },
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
      // Prefer bounceCategory (POLICY_BLOCK/COMPLAINT) over the raw suppressionReason —
      // on the Resend rail suppressionReason is only the generic 'hard_bounce'/
      // 'soft_bounce'/'complaint', which reads as far less actionable in this alert
      // than the classified category. 2026-09-13 cross-rail fix.
      return `<li><strong>${domainOf(f.emailAddress)}</strong> — ${f.bounceCategory || f.suppressionReason || 'unknown'} @ ${f.createdAt.toISOString()}${diag ? `<br><code style="font-size:11px">${diag}</code>` : ''}</li>`;
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
        <p>This fires independent of the weekly bounce-rate check (which now also covers all sending rails, but only alerts on the 7-day aggregate rate crossing 2% — a single explicit spam-block signal like this is worth a same-day alert on its own). See claude_docs/audits/email-deliverability-audit-2026-09-06.md for background.</p>
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

