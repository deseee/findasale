import { google } from 'googleapis';
import { v4 as uuid } from 'uuid';
import type { Transporter } from 'nodemailer';

/**
 * Provider-agnostic outreach transport rail.
 *
 * Cold outreach historically sent ONLY via the Gmail API (outreach@finda.sale
 * Workspace), which Google reputation-throttles to ~200-300/day. This module
 * adds a SECOND transport — generic SMTP via nodemailer — so outreach can run
 * from a dedicated sending domain (Amazon SES SMTP, or any SMTP provider),
 * isolating finda.sale's primary reputation.
 *
 * Transport selection: process.env.OUTREACH_SENDER
 *   - 'gmail' (default / unset) -> existing Gmail API path, UNCHANGED.
 *   - 'smtp'                    -> nodemailer SMTP transport.
 *
 * IMPORTANT: nothing changes until OUTREACH_SENDER=smtp is set. The default is
 * the existing Gmail behavior, so this migration is inert until the domain is
 * provisioned and the SMTP env vars are set in Railway.
 */

export type OutreachSender = 'gmail' | 'smtp';

export interface OutreachMessage {
  /** Full From header value, e.g. `The FindA.Sale Team <outreach@finda.sale>`. */
  from: string;
  to: string;
  subject: string;
  /** Full HTML body (already includes CAN-SPAM footer + tracking pixel). */
  html: string;
  /** Full List-Unsubscribe header value, e.g. `<mailto:...>, <https://.../unsubscribe?token=...>`. */
  listUnsubscribe: string;
}

/** Which rail is active. Defaults to Gmail when unset or unrecognized. */
export function getOutreachSender(): OutreachSender {
  return process.env.OUTREACH_SENDER === 'smtp' ? 'smtp' : 'gmail';
}

// ---------------------------------------------------------------------------
// Shared MIME helpers (mirrors emailService / outreachEmailsCron construction so
// the SMTP rail produces the same multipart/alternative shape as the Gmail rail).
// ---------------------------------------------------------------------------

/** RFC 2047 encode a header value if it contains non-ASCII characters. */
function encodeSubject(subject: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`;
}

/** Convert HTML to plain text for the text/plain MIME part. */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|h[1-6]|li|tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Build an RFC 2822 raw email string for the Gmail API path.
 * Returns base64url-encoded string ready for gmail.users.messages.send.
 */
function buildRawEmail(opts: OutreachMessage): string {
  const boundary = `boundary_${uuid().replace(/-/g, '')}`;
  const plainText = htmlToPlainText(opts.html);
  const plainBase64 = Buffer.from(plainText, 'utf-8').toString('base64');
  const htmlBase64 = Buffer.from(opts.html, 'utf-8').toString('base64');
  const rawLines = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${encodeSubject(opts.subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    `List-Unsubscribe: ${opts.listUnsubscribe}`,
    `List-Unsubscribe-Post: List-Unsubscribe=One-Click`,
    '',
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    '',
    plainBase64,
    '',
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    '',
    htmlBase64,
    '',
    `--${boundary}--`,
  ];
  const rawEmail = rawLines.join('\r\n');
  return Buffer.from(rawEmail).toString('base64url');
}

// ---------------------------------------------------------------------------
// Gmail rail (UNCHANGED behavior — same auth + same raw construction as before).
// ---------------------------------------------------------------------------

let cachedGmail: ReturnType<typeof google.gmail> | null = null;

function getGmailClient(): ReturnType<typeof google.gmail> {
  if (cachedGmail) return cachedGmail;
  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET || !process.env.GMAIL_REFRESH_TOKEN) {
    throw new Error('Missing GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, or GMAIL_REFRESH_TOKEN');
  }
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
  );
  oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  cachedGmail = google.gmail({ version: 'v1', auth: oauth2Client });
  return cachedGmail;
}

async function sendViaGmail(msg: OutreachMessage): Promise<void> {
  const gmail = getGmailClient();
  const raw = buildRawEmail(msg);
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
}

// ---------------------------------------------------------------------------
// SMTP rail (nodemailer). Lazy-init + module-level cache.
// ---------------------------------------------------------------------------

let cachedTransport: Transporter | null = null;

/**
 * Validate SMTP env config and build (or return cached) nodemailer transport.
 * LOUD FAILURE: if OUTREACH_SENDER=smtp but required vars are missing, this
 * throws — we do NOT silently fall back to Gmail. A silent fallback would route
 * cold-blast volume back through finda.sale's primary reputation (the exact
 * thing this migration exists to prevent).
 */
async function getSmtpTransport(): Promise<Transporter> {
  if (cachedTransport) return cachedTransport;

  const host = process.env.OUTREACH_SMTP_HOST;
  const user = process.env.OUTREACH_SMTP_USER;
  const pass = process.env.OUTREACH_SMTP_PASS;

  const missing: string[] = [];
  if (!host) missing.push('OUTREACH_SMTP_HOST');
  if (!user) missing.push('OUTREACH_SMTP_USER');
  if (!pass) missing.push('OUTREACH_SMTP_PASS');
  if (missing.length > 0) {
    throw new Error(
      `[OutreachSender] OUTREACH_SENDER=smtp but required SMTP env var(s) missing: ${missing.join(', ')}. ` +
        `Refusing to send (no silent Gmail fallback - that would leak cold-blast volume onto the primary reputation).`,
    );
  }

  const port = parseInt(process.env.OUTREACH_SMTP_PORT || '587', 10);
  // secure=true -> implicit TLS (port 465). secure=false -> STARTTLS upgrade (port 587, default).
  const secure = process.env.OUTREACH_SMTP_SECURE === 'true';

  // Lazy import so the dependency is only loaded on the SMTP path.
  // nodemailer ^6.9.16 is already a backend dependency.
  const nodemailer = await import('nodemailer');
  cachedTransport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user: user as string, pass: pass as string },
  });
  console.log(`[OutreachSender] SMTP transport initialized (host=${host}, port=${port}, secure=${secure})`);
  return cachedTransport;
}

/** Resolve the From header for the SMTP rail. */
function resolveSmtpFrom(fallbackFrom: string): string {
  const fromEmail = process.env.OUTREACH_FROM_EMAIL;
  if (!fromEmail) {
    console.warn(
      '[OutreachSender] OUTREACH_SENDER=smtp but OUTREACH_FROM_EMAIL is unset - ' +
        `falling back to the caller-supplied From ("${fallbackFrom}"). Set OUTREACH_FROM_EMAIL ` +
        'to the dedicated sending-domain address whose SPF/DKIM is configured.',
    );
    return fallbackFrom;
  }
  const fromName = process.env.OUTREACH_FROM_NAME || 'The FindA.Sale Team';
  return `${fromName} <${fromEmail}>`;
}

async function sendViaSmtp(msg: OutreachMessage): Promise<void> {
  const transport = await getSmtpTransport();
  const from = resolveSmtpFrom(msg.from);
  await transport.sendMail({
    from,
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
    text: htmlToPlainText(msg.html),
    headers: {
      'List-Unsubscribe': msg.listUnsubscribe,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });
}

// ---------------------------------------------------------------------------
// Public send entry point + limit-error matcher.
// ---------------------------------------------------------------------------

/**
 * Send one outreach message via the active rail (gmail | smtp).
 * The caller is responsible for ALL guards (OUTREACH_ENABLED, suppression,
 * daily cap, pacing). This function only performs transport.
 */
export async function sendOutreachMessage(msg: OutreachMessage): Promise<void> {
  if (getOutreachSender() === 'smtp') {
    await sendViaSmtp(msg);
  } else {
    await sendViaGmail(msg);
  }
}

/**
 * Determine whether a transport error is a rate/limit/throttle/quota signal that
 * should trigger the day-stop backoff. Matches BOTH:
 *   - Gmail API: HTTP 429 + "reached a limit for sending mail" style messages.
 *   - SMTP: 4xx transient codes 421/450/452 + rate/quota/throttle text.
 */
export function isOutreachLimitError(err: any): boolean {
  const status = err?.code ?? err?.responseCode ?? err?.response?.status;
  const msg: string = err?.message || err?.response || '';

  // Gmail HTTP 429
  if (status === 429) return true;

  // SMTP transient/limit response codes (numeric or string forms).
  const SMTP_LIMIT_CODES = new Set([421, 450, 452]);
  if (typeof status === 'number' && SMTP_LIMIT_CODES.has(status)) return true;
  if (typeof status === 'string' && SMTP_LIMIT_CODES.has(parseInt(status, 10))) return true;

  // Text match across both rails (Gmail clamp message + SMTP enhanced status text).
  return /rate|too many|throttl|limit|quota|exceeded/i.test(String(msg));
}
