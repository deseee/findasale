import { google } from 'googleapis';
import { Resend } from 'resend';
import * as Sentry from '@sentry/node';
import { isEmailDomainBlocked, suppressionService } from '../services/suppressionService';

/**
 * Transactional email service — uses Gmail API (same auth as outreach).
 * FROM address: uses GMAIL_FROM_EMAIL env var (falls back to legacy SES_FROM_EMAIL; defaults to find@outreach.finda.sale).
 * Must match the same DKIM/SPF domain as outreach emails (outreach.finda.sale).
 */

// ---------------------------------------------------------------------------
// Daily email quota — DB-backed, persists across Railway restarts/deploys.
// Replaces the in-memory Map that was resetting to zero on every process start,
// allowing the pipeline to re-send the full daily quota after each deploy.
// Root cause of the 8,317-email blast on Jun 5 (S887).
// ---------------------------------------------------------------------------

// Hard limit: refuse to send beyond this. Leaves 500-email buffer below the
// Google Workspace Business Starter 2,000/day cap.
const HARD_LIMIT = parseInt(process.env.GMAIL_DAILY_HARD_LIMIT || '1500', 10);
// Alert threshold: send an out-of-band Resend alert when count crosses this.
const ALERT_THRESHOLD = Math.floor(HARD_LIMIT * 0.75);
// Who gets the alert email.
const ALERT_RECIPIENT = process.env.QUOTA_ALERT_EMAIL;

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

/** Send an out-of-band alert via Resend (bypasses Gmail — safe even when Gmail is throttled). */
async function sendQuotaAlert(count: number, limit: number, reason: 'warning' | 'hard_stop'): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[EmailService] RESEND_API_KEY not set — cannot send quota alert');
    return;
  }
  if (!ALERT_RECIPIENT) {
    console.error('[EmailService] QUOTA_ALERT_EMAIL not set — cannot send quota alert');
    return;
  }
  try {
    const resend = new Resend(apiKey);
    const subject = reason === 'hard_stop'
      ? `🚨 Gmail send BLOCKED — daily limit reached (${count}/${limit})`
      : `⚠️ Gmail quota warning — ${count}/${limit} emails sent today`;
    const html = `
      <p><strong>${reason === 'hard_stop' ? '🚨 BLOCKED' : '⚠️ WARNING'}:</strong> outreach@finda.sale has sent <strong>${count} of ${limit}</strong> allowed emails today.</p>
      <p>${reason === 'hard_stop'
        ? 'Further sends are <strong>blocked by the application</strong> until midnight UTC. No action needed — the pipeline will resume tomorrow.'
        : `Approaching the daily hard limit. The pipeline will auto-block at ${limit} sends.`
      }</p>
      <p>To change the limit: set <code>GMAIL_DAILY_HARD_LIMIT</code> in Railway env vars (current: ${limit}).</p>
      <p style="color:#666;font-size:12px">FindA.Sale · emailService.ts quota guard</p>
    `;
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'FindA.Sale Alerts <alerts@finda.sale>',
      to: ALERT_RECIPIENT,
      subject,
      html,
    });
    console.log(`[EmailService] Quota alert sent to ${ALERT_RECIPIENT} (${reason}, count=${count})`);
  } catch (err) {
    console.error('[EmailService] Failed to send quota alert via Resend:', err);
  }
}

/**
 * Increment the DB-backed daily counter and enforce send limits.
 * Throws QuotaExceededError if the hard limit is reached.
 * Sends a Resend alert at ALERT_THRESHOLD (once per day) and at hard stop.
 *
 * Call this BEFORE sending via Gmail. If it throws, do not send.
 */
export async function checkAndIncrementQuota(jobName: string, recipient: string): Promise<number> {
  // Lazy import to avoid circular dep (prisma.ts imports from lib files)
  const { prisma } = await import('./prisma');
  const date = getTodayKey();

  // Atomic increment — upsert ensures no race condition between concurrent runs
  const log = await prisma.emailQuotaLog.upsert({
    where: { date },
    update: { count: { increment: 1 } },
    create: { date, count: 1 },
  });

  const count = log.count;
  console.log(`[EmailService] Daily quota: ${count}/${HARD_LIMIT} (${jobName} → ${recipient})`);

  // --- Hard stop ---
  if (count > HARD_LIMIT) {
    // Alert only on the first email that crosses the limit (count === HARD_LIMIT + 1)
    if (count === HARD_LIMIT + 1) {
      await sendQuotaAlert(count, HARD_LIMIT, 'hard_stop');
    }
    throw new QuotaExceededError(`Daily Gmail quota exceeded: ${count}/${HARD_LIMIT}. Send blocked.`);
  }

  // --- Warning threshold (once per day) ---
  if (count >= ALERT_THRESHOLD) {
    const alreadyAlerted = log.alertSentAt
      && log.alertSentAt.toISOString().slice(0, 10) === date;
    if (!alreadyAlerted) {
      // Mark alerted before sending to avoid duplicate alerts if two sends hit this simultaneously
      await prisma.emailQuotaLog.update({
        where: { date },
        data: { alertSentAt: new Date() },
      });
      await sendQuotaAlert(count, HARD_LIMIT, 'warning');
    }
  }

  return count;
}

/** Custom error so callers can distinguish quota refusals from other failures. */
export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

/**
 * @deprecated Use checkAndIncrementQuota() which is DB-backed.
 * Kept for backward compatibility — now async and delegates to DB counter.
 */
export async function incrementDailyEmailCount(jobName: string, recipient: string): Promise<number> {
  return checkAndIncrementQuota(jobName, recipient);
}

/** Query current daily usage from DB. */
export async function getDailyEmailCount(): Promise<{ date: string; sent: number; remaining: number; percentUsed: number }> {
  const { prisma } = await import('./prisma');
  const date = getTodayKey();
  const log = await prisma.emailQuotaLog.findUnique({ where: { date } });
  const sent = log?.count ?? 0;
  return {
    date,
    sent,
    remaining: Math.max(0, HARD_LIMIT - sent),
    percentUsed: Math.round((sent / HARD_LIMIT) * 100),
  };
}

/**
 * Outreach-only daily attempt counter (OutreachQuotaLog) — separate from the
 * platform-wide EmailQuotaLog table above. Added 2026-07-03: outreachEmailsCron.ts
 * was gating OUTREACH_DAILY_CAP against the SHARED global counter, which is
 * incremented by every Gmail-rail send (transactional AND outreach). That let
 * ordinary transactional volume silently eat into the outreach cap. This counter
 * is incremented ONLY by outreach sends (see checkAndIncrementOutreachQuota calls
 * in outreachEmailsCron.ts) and is what OUTREACH_DAILY_CAP should be compared
 * against. It does NOT replace checkAndIncrementQuota() — that call must still run
 * on every outreach send too, since it protects the true platform-wide
 * GMAIL_DAILY_HARD_LIMIT and feeds gmailHealthCron's daily quota report, both of
 * which correctly need to include outreach volume.
 */
export async function checkAndIncrementOutreachQuota(recipient: string): Promise<number> {
  const { prisma } = await import('./prisma');
  const date = getTodayKey();
  const log = await prisma.outreachQuotaLog.upsert({
    where: { date },
    update: { count: { increment: 1 } },
    create: { date, count: 1 },
  });
  console.log(`[EmailService] Outreach-only daily quota: ${log.count} (outreachEmailsCron → ${recipient})`);
  return log.count;
}

/** Query current outreach-only daily attempt count from DB (OutreachQuotaLog). */
export async function getOutreachDailyCount(): Promise<{ date: string; sent: number }> {
  const { prisma } = await import('./prisma');
  const date = getTodayKey();
  const log = await prisma.outreachQuotaLog.findUnique({ where: { date } });
  return { date, sent: log?.count ?? 0 };
}

/** Pin today's outreach-only counter to a fixed value (used by the send-limit backoff
 * in outreachEmailsCron.ts to immediately block further sends for the rest of the day). */
export async function pinOutreachQuotaToday(count: number): Promise<void> {
  const { prisma } = await import('./prisma');
  const date = getTodayKey();
  await prisma.outreachQuotaLog.upsert({
    where: { date },
    update: { count },
    create: { date, count },
  });
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|h[1-6]|li|tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ')
    .trim();
}

function createGmailClient() {
  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET || !process.env.GMAIL_REFRESH_TOKEN) {
    throw new Error('[emailService] Missing GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, or GMAIL_REFRESH_TOKEN');
  }
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );
  oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
  });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

function encodeSubject(subject: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(subject)) return subject;
  const encoded = Buffer.from(subject, 'utf-8').toString('base64');
  return `=?UTF-8?B?${encoded}?=`;
}

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://finda.sale';

function buildRawMessage(options: {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
  listUnsubscribe?: string;
}): string {
  const toAddresses = Array.isArray(options.to) ? options.to.join(', ') : options.to;
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const unsubUrl = options.listUnsubscribe || `${FRONTEND_URL}/settings/notifications`;

  const headers = [
    `From: ${options.from}`,
    `To: ${toAddresses}`,
    `Subject: ${encodeSubject(options.subject)}`,
    `MIME-Version: 1.0`,
    ...(options.replyTo ? [`Reply-To: ${options.replyTo}`] : []),
    `List-Unsubscribe: <${unsubUrl}>`,
    `List-Unsubscribe-Post: List-Unsubscribe=One-Click`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];

  const plainText = htmlToPlainText(options.html);
  const plainBase64 = Buffer.from(plainText, 'utf-8').toString('base64');
  const htmlBase64 = Buffer.from(options.html, 'utf-8').toString('base64');
  const body = [
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    plainBase64,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    htmlBase64,
    ``,
    `--${boundary}--`,
  ];

  const raw = [...headers, '', ...body].join('\r\n');
  return Buffer.from(raw).toString('base64url');
}

export const emailService = {
  emails: {
    /**
     * Send a transactional email via Gmail API.
     * Checks and increments the DB-backed daily quota before sending.
     * Throws QuotaExceededError if the hard limit is reached — caller should catch and abort.
     */
    send: async (options: {
      from: string;
      to: string | string[];
      subject: string;
      html: string;
      replyTo?: string;
      listUnsubscribe?: string;
      jobName?: string;
    }) => {
      // ---------------------------------------------------------------------
      // Rail-level unsendable-domain guard (S937). Runs BEFORE quota + send so
      // even callers that never check suppression cannot blast placeholder /
      // blocked domains (e.g. scraper+slug@system.finda.sale → DSN bounce flood).
      // ---------------------------------------------------------------------
      const recipients = Array.isArray(options.to) ? options.to : [options.to];
      const sendable = recipients.filter(r => r && !isEmailDomainBlocked(r));
      if (sendable.length === 0) {
        console.warn(
          '[emailService] Skipped — all recipients unsendable (placeholder/blocked domain):',
          recipients.join(', '),
        );
        return;
      }
      // Rail-level hard-suppression floor (S937) — drop hard-bounce/complaint
      // recipients even when the caller never checked suppression. Opt-out and
      // soft-bounce are NOT dropped here (marketing-only signals).
      const hardMap = await suppressionService.checkMultipleHard(sendable);
      const finalRecipients = sendable.filter(r => !hardMap.get(r.toLowerCase()));
      if (finalRecipients.length === 0) {
        console.warn('[emailService] Skipped — all recipients hard-suppressed (bounce/complaint):', sendable.join(', '));
        return;
      }
      // Narrow to sendable addresses — junk dropped, real recipients still go.
      const sendOptions = { ...options, to: finalRecipients };

      const recipient = finalRecipients[0];
      // Quota check BEFORE send — throws QuotaExceededError if at hard limit
      await checkAndIncrementQuota(options.jobName ?? 'unknown', recipient);

      const gmail = createGmailClient();
      const raw = buildRawMessage(sendOptions);

      try {
        return await gmail.users.messages.send({
          userId: 'me',
          requestBody: { raw },
        });
      } catch (err: any) {
        Sentry.captureException(err, {
          tags: { email_rail: 'gmail', kind: 'gmail_send_failed' },
          extra: { from: options.from, subject: options.subject, jobName: options.jobName ?? 'unknown' },
        });
        throw err; // preserve existing caller behavior
      }
    },
  },
};
