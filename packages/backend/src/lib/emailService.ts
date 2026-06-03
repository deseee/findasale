import { google } from 'googleapis';

/**
 * Transactional email service — uses Gmail API (same auth as outreach).
 * FROM address: uses SES_FROM_EMAIL env var (defaults to find@outreach.finda.sale).
 * Must match the same DKIM/SPF domain as outreach emails (outreach.finda.sale).
 */

// ---------------------------------------------------------------------------
// Daily email counter — shared across all senders including outreachEmailsCron
// ---------------------------------------------------------------------------
const DAILY_LIMIT = 2000;
const dailyCounts = new Map<string, number>();

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

/** Increment the counter and emit threshold warnings. Returns the new count. */
export function incrementDailyEmailCount(jobName: string, recipient: string): number {
  const key = getTodayKey();
  const prev = dailyCounts.get(key) ?? 0;
  const count = prev + 1;
  dailyCounts.set(key, count);

  // Evict yesterday's keys to keep the map from growing indefinitely
  for (const k of dailyCounts.keys()) {
    if (k !== key) dailyCounts.delete(k);
  }

  console.log(`[EmailService] Send #${count} today (${jobName} → ${recipient})`);

  if (count === 1500) {
    console.error(`[EmailService] ⚠️ WARNING: 1,500 emails sent today — approaching Gmail 2,000/day limit`);
  } else if (count === 1800) {
    console.error(`[EmailService] 🔴 CRITICAL: 1,800 emails sent today — ${DAILY_LIMIT - count} remaining`);
  } else if (count === 1950) {
    console.error(`[EmailService] 🚨 EMERGENCY: 1,950/2000 daily limit reached — subsequent sends may fail`);
  }

  return count;
}

/** Query current daily usage. Safe to call from any job or admin route. */
export function getDailyEmailCount(): { date: string; sent: number; remaining: number; percentUsed: number } {
  const date = getTodayKey();
  const sent = dailyCounts.get(date) ?? 0;
  return {
    date,
    sent,
    remaining: Math.max(0, DAILY_LIMIT - sent),
    percentUsed: Math.round((sent / DAILY_LIMIT) * 100),
  };
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

/**
 * RFC 2047 encode a header value if it contains non-ASCII characters.
 * Uses Base64 encoding: =?UTF-8?B?<base64>?=
 */
function encodeSubject(subject: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(subject)) return subject;
  const encoded = Buffer.from(subject, 'utf-8').toString('base64');
  return `=?UTF-8?B?${encoded}?=`;
}

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://finda.sale';

/**
 * Build an RFC 2822 raw email and Base64url-encode it for the Gmail API.
 * Sends multipart/alternative with text/plain + text/html — required for Yahoo delivery.
 * List-Unsubscribe headers are required by Yahoo/Gmail bulk sender policy (Feb 2024).
 */
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
    send: async (options: {
      from: string;
      to: string | string[];
      subject: string;
      html: string;
      replyTo?: string;
      listUnsubscribe?: string;
      jobName?: string;
    }) => {
      const recipient = Array.isArray(options.to) ? options.to[0] : options.to;
      incrementDailyEmailCount(options.jobName ?? 'unknown', recipient);

      const gmail = createGmailClient();
      const raw = buildRawMessage(options);

      return gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw },
      });
    },
  },
};
