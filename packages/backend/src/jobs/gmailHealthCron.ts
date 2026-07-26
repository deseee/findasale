import cron from 'node-cron';
import { google } from 'googleapis';
import { Resend } from 'resend';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';

/**
 * gmailHealthCron.ts — Gmail OAuth health checks + daily quota summary
 *
 * Three scheduled jobs:
 *  1. runGmailOAuthHealthCheck — daily 06:30 UTC  — tests refresh token validity
 *  2. runDailySendSummary      — daily 08:00 UTC  — sends yesterday's quota digest
 *  3. runSuspensionDetect      — every 2 hours    — alerts if pipeline is quota-blocked
 *
 * All alerts are sent via Resend (bypasses Gmail — safe even when Gmail is broken).
 */

const ALERT_RECIPIENT = process.env.QUOTA_ALERT_EMAIL;
const HARD_LIMIT = parseInt(process.env.GMAIL_DAILY_HARD_LIMIT || '1500', 10);

/** Send an out-of-band alert via Resend. */
async function sendResendAlert(subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[GmailHealthCron] RESEND_API_KEY not set — cannot send alert');
    return;
  }
  if (!ALERT_RECIPIENT) {
    console.error('[GmailHealthCron] QUOTA_ALERT_EMAIL not set — cannot send alert');
    return;
  }
  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'FindA.Sale Alerts <alerts@finda.sale>',
      to: ALERT_RECIPIENT,
      subject,
      html,
    });
    console.log(`[GmailHealthCron] Alert sent to ${ALERT_RECIPIENT}: ${subject}`);
  } catch (err) {
    console.error('[GmailHealthCron] Failed to send Resend alert:', err);
  }
}

// ---------------------------------------------------------------------------
// 1. Gmail OAuth health check — daily 06:30 UTC
// ---------------------------------------------------------------------------

/**
 * Tests that the Gmail OAuth refresh token still works by calling
 * gmail.users.getProfile. Sends a Resend alert if the token is broken.
 * Skips silently (logs warning) if env vars are missing — that's a config
 * gap, not a token breakage.
 */
export async function runGmailOAuthHealthCheck(): Promise<void> {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    console.warn(
      '[GmailHealth] Missing GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN — skipping health check (config gap, not breakage)'
    );
    return;
  }

  try {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    // Probe with a send-scope-only liveness check: refresh the access token.
    // This exercises the refresh_token without calling any read API (getProfile
    // requires a read scope the send-only token does not — and should not — have).
    const { token } = await oauth2Client.getAccessToken();
    if (!token) {
      throw new Error('OAuth2 client returned an empty access token');
    }

    const sender = process.env.GMAIL_FROM_EMAIL || '(send scope OK)';
    console.log(`[GmailHealth] OAuth token valid — send scope OK — ${sender}`);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[GmailHealth] OAuth token check FAILED: ${errMsg}`);

    await sendResendAlert(
      '🔴 Gmail OAuth token BROKEN — outreach pipeline dead',
      `
        <p><strong>🔴 CRITICAL:</strong> The Gmail OAuth refresh token is no longer valid.</p>
        <p>The outreach pipeline is <strong>dead</strong> — no emails can be sent until the token is re-authorized.</p>
        <p><strong>Error:</strong> <code>${errMsg}</code></p>
        <p><strong>To fix:</strong> Re-run the Gmail OAuth flow and update <code>GMAIL_REFRESH_TOKEN</code> in Railway env vars.</p>
        <p style="color:#666;font-size:12px">FindA.Sale · gmailHealthCron.ts · runGmailOAuthHealthCheck</p>
      `
    );
  }
}

cron.schedule(
  '30 6 * * *',
  cronGuard({ jobName: 'gmailOAuthHealthCheck' }, runGmailOAuthHealthCheck)
);

// ---------------------------------------------------------------------------
// 2. Daily send summary — daily 08:00 UTC
// ---------------------------------------------------------------------------

/**
 * Reads yesterday's EmailQuotaLog row and sends a Resend digest to QUOTA_ALERT_EMAIL.
 * Skips if no row exists for yesterday (zero sends — no email needed).
 */
export async function runDailySendSummary(): Promise<void> {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10); // YYYY-MM-DD

  const log = await prisma.emailQuotaLog.findUnique({ where: { date: yesterday } });

  if (!log || log.count === 0) {
    console.log(`[DailySendSummary] No sends recorded for ${yesterday} — skipping digest`);
    return;
  }

  const sent = log.count;
  const remaining = Math.max(0, HARD_LIMIT - sent);
  const pct = ((sent / HARD_LIMIT) * 100).toFixed(1);

  const subject = `📊 Gmail quota: ${sent}/${HARD_LIMIT} sent yesterday (${pct}% used)`;
  const html = `
    <h2>📊 Daily Gmail Quota Summary</h2>
    <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
      <thead>
        <tr style="background:#f3f4f6">
          <th style="border:1px solid #e5e7eb;padding:8px 16px;text-align:left">Date</th>
          <th style="border:1px solid #e5e7eb;padding:8px 16px;text-align:right">Sent</th>
          <th style="border:1px solid #e5e7eb;padding:8px 16px;text-align:right">Remaining</th>
          <th style="border:1px solid #e5e7eb;padding:8px 16px;text-align:right">Hard Limit</th>
          <th style="border:1px solid #e5e7eb;padding:8px 16px;text-align:right">% Used</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="border:1px solid #e5e7eb;padding:8px 16px">${yesterday}</td>
          <td style="border:1px solid #e5e7eb;padding:8px 16px;text-align:right">${sent.toLocaleString()}</td>
          <td style="border:1px solid #e5e7eb;padding:8px 16px;text-align:right">${remaining.toLocaleString()}</td>
          <td style="border:1px solid #e5e7eb;padding:8px 16px;text-align:right">${HARD_LIMIT.toLocaleString()}</td>
          <td style="border:1px solid #e5e7eb;padding:8px 16px;text-align:right">${pct}%</td>
        </tr>
      </tbody>
    </table>
    <p style="color:#666;font-size:12px;margin-top:16px">FindA.Sale · gmailHealthCron.ts · runDailySendSummary</p>
  `;

  await sendResendAlert(subject, html);
  console.log(`[DailySendSummary] Digest sent for ${yesterday}: ${sent}/${HARD_LIMIT} (${pct}%)`);
}

cron.schedule(
  '0 8 * * *',
  cronGuard({ jobName: 'dailySendSummary' }, runDailySendSummary)
);

// ---------------------------------------------------------------------------
// 3. Suspension detect — every 2 hours
// ---------------------------------------------------------------------------

/**
 * Checks if outreach was auto-disabled today due to quota exhaustion.
 * Sends ONE Resend alert per day (uses alertSentAt to deduplicate).
 */
export async function runSuspensionDetect(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const log = await prisma.emailQuotaLog.findUnique({ where: { date: today } });

  if (!log) {
    // No sends today yet — nothing to check
    return;
  }

  const isQuotaExhausted = log.count >= HARD_LIMIT;
  const isOutreachDisabled = process.env.OUTREACH_ENABLED !== 'true';

  if (!isQuotaExhausted || !isOutreachDisabled) {
    // Pipeline is fine
    return;
  }

  // Deduplication: only send once per day
  const alreadyAlerted =
    log.alertSentAt && log.alertSentAt.toISOString().slice(0, 10) === today;

  if (alreadyAlerted) {
    console.log(`[SuspensionDetect] Already alerted for ${today} — skipping`);
    return;
  }

  // Mark as alerted BEFORE sending to prevent double-send under concurrent runs
  await prisma.emailQuotaLog.update({
    where: { date: today },
    data: { alertSentAt: new Date() },
  });

  const subject = `🚫 Outreach pipeline BLOCKED — quota exhausted (${log.count}/${HARD_LIMIT})`;
  const html = `
    <p><strong>🚫 PIPELINE BLOCKED:</strong> The outreach pipeline is currently disabled.</p>
    <p>Today's Gmail quota has been exhausted: <strong>${log.count.toLocaleString()} of ${HARD_LIMIT.toLocaleString()}</strong> emails sent.</p>
    <p>Outreach will <strong>auto-resume tomorrow at midnight UTC</strong> when the quota counter resets.</p>
    <p>No action is needed unless you want to increase the limit (set <code>GMAIL_DAILY_HARD_LIMIT</code> in Railway env vars).</p>
    <p style="color:#666;font-size:12px">FindA.Sale · gmailHealthCron.ts · runSuspensionDetect</p>
  `;

  await sendResendAlert(subject, html);
  console.log(`[SuspensionDetect] Suspension alert sent for ${today} — ${log.count}/${HARD_LIMIT}`);
}

cron.schedule(
  '0 */2 * * *',
  cronGuard({ jobName: 'suspensionDetect' }, runSuspensionDetect)
);
