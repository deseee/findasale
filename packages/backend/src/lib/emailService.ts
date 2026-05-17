import { google } from 'googleapis';

/**
 * Transactional email service — uses Gmail API (same auth as outreach).
 * SES SMTP is pending approval; Gmail API is the active transport.
 *
 * FROM address: uses SES_FROM_EMAIL env var (defaults to notifications@send.finda.sale).
 * Gmail send-as alias must be configured for whatever FROM address is used.
 */

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
 * Build an RFC 2822 raw email and Base64url-encode it for the Gmail API.
 */
function buildRawMessage(options: {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}): string {
  const toAddresses = Array.isArray(options.to) ? options.to.join(', ') : options.to;
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const headers = [
    `From: ${options.from}`,
    `To: ${toAddresses}`,
    `Subject: ${options.subject}`,
    `MIME-Version: 1.0`,
    ...(options.replyTo ? [`Reply-To: ${options.replyTo}`] : []),
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];

  const body = [
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    options.html,
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
    }) => {
      const gmail = createGmailClient();
      const raw = buildRawMessage(options);

      return gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw },
      });
    },
  },
};
