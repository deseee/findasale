import { google } from 'googleapis';
import { prisma } from '../lib/prisma';

/**
 * Bounce Suppression Service
 *
 * Polls the outreach@finda.sale Gmail inbox for mailer-daemon / postmaster
 * delivery-failure notifications, extracts the bounced recipient address,
 * upserts it into EmailSuppression, and moves the processed message to Trash.
 *
 * Auth pattern copied from lib/emailService.ts (createGmailClient).
 * Uses the same GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN
 * env vars — no additional credentials required.
 *
 * Scheduled: daily at 06:00 UTC (registered in index.ts).
 */

interface ProcessResult {
  processed: number;
  suppressed: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Gmail client factory — prefers GMAIL_MAILBOX_REFRESH_TOKEN (needs gmail.modify
// scope to list/get/trash messages). Falls back to GMAIL_REFRESH_TOKEN.
// Same pattern as scripts/outreach-mailbox-ops.js.
// ---------------------------------------------------------------------------
function createGmailClient() {
  const token = process.env.GMAIL_MAILBOX_REFRESH_TOKEN || process.env.GMAIL_REFRESH_TOKEN;
  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET || !token) {
    throw new Error('[bounceSuppressService] Missing GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, or GMAIL_MAILBOX_REFRESH_TOKEN (or GMAIL_REFRESH_TOKEN)');
  }
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ refresh_token: token });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

// ---------------------------------------------------------------------------
// Address extraction helpers
// ---------------------------------------------------------------------------

/**
 * Try to pull a bounced address from common bounce header patterns and body text.
 * Returns the first valid-looking email address found, or null.
 */
function extractBouncedAddress(headers: Array<{ name?: string | null; value?: string | null }>, bodyText: string): string | null {
  // 1. X-Failed-Recipients header (most reliable — set by many MTAs)
  const failedHeader = headers.find(h => h.name?.toLowerCase() === 'x-failed-recipients');
  if (failedHeader?.value) {
    const addr = parseFirstEmail(failedHeader.value);
    if (addr) return addr;
  }

  // 2. Final-Recipient header in DSN (RFC 3464)
  const finalRecipient = headers.find(h => h.name?.toLowerCase() === 'final-recipient');
  if (finalRecipient?.value) {
    const addr = parseFirstEmail(finalRecipient.value);
    if (addr) return addr;
  }

  // 3. Original-Rcpt-To header
  const origRcpt = headers.find(h => h.name?.toLowerCase() === 'original-rcpt-to');
  if (origRcpt?.value) {
    const addr = parseFirstEmail(origRcpt.value);
    if (addr) return addr;
  }

  // 4. Scan body text for the most common DSN phrase patterns
  //    "The following address(es) failed:" / "did not reach" / "undeliverable to"
  const bodyPatterns = [
    /the following address(?:es)? failed:\s*([\w._%+\-]+@[\w.\-]+\.[a-z]{2,})/i,
    /undeliverable(?:\s+to)?\s+([\w._%+\-]+@[\w.\-]+\.[a-z]{2,})/i,
    /delivery to the following recipient[^:]*failed[^\n]*\n\s*([\w._%+\-]+@[\w.\-]+\.[a-z]{2,})/i,
    /final recipient:.*rfc822;\s*([\w._%+\-]+@[\w.\-]+\.[a-z]{2,})/i,
  ];
  for (const pattern of bodyPatterns) {
    const m = bodyText.match(pattern);
    if (m?.[1]) return m[1].trim().toLowerCase();
  }

  // 5. Last-resort generic email scan — avoid matching our own sending domain
  const emailRe = /([\w._%+\-]+@[\w.\-]+\.[a-z]{2,})/gi;
  let m: RegExpExecArray | null;
  while ((m = emailRe.exec(bodyText)) !== null) {
    const candidate = m[1].toLowerCase();
    // Skip system addresses and our own sending domains
    if (
      candidate.includes('mailer-daemon') ||
      candidate.includes('postmaster') ||
      candidate.includes('finda.sale') ||
      candidate.includes('outreach.finda.sale')
    ) continue;
    return candidate;
  }

  return null;
}

function parseFirstEmail(value: string): string | null {
  const m = value.match(/([\w._%+\-]+@[\w.\-]+\.[a-z]{2,})/i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Decode a Gmail message part body (base64url encoded).
 */
function decodeBody(data?: string | null): string {
  if (!data) return '';
  try {
    return Buffer.from(data, 'base64url').toString('utf-8');
  } catch {
    return '';
  }
}

/**
 * Recursively extract all text from a MIME message payload.
 */
function extractText(payload: { mimeType?: string | null; body?: { data?: string | null } | null; parts?: any[] | null }): string {
  const mimeType = payload.mimeType ?? '';
  if (mimeType === 'text/plain' || mimeType === 'text/html') {
    return decodeBody(payload.body?.data);
  }
  if (payload.parts) {
    return payload.parts.map((p: any) => extractText(p)).join('\n');
  }
  return '';
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export const bounceSuppressService = {
  /**
   * Process bounce messages from the Gmail inbox.
   * Safe to call repeatedly — already-suppressed addresses are silently skipped (upsert).
   */
  async processBounces(): Promise<ProcessResult> {
    const result: ProcessResult = { processed: 0, suppressed: 0, errors: [] };

    let gmail: ReturnType<typeof google.gmail>;
    try {
      gmail = createGmailClient();
    } catch (err: any) {
      result.errors.push(`Gmail auth failed: ${err.message}`);
      console.error('[bounceSuppressService] Gmail auth error:', err.message);
      return result;
    }

    // Search for bounce/failure notifications not yet processed (not in Trash)
    let messageIds: string[] = [];
    try {
      const listResp = await gmail.users.messages.list({
        userId: 'me',
        q: 'from:mailer-daemon OR from:postmaster -in:trash',
        maxResults: 100,
      });
      messageIds = (listResp.data.messages ?? []).map(m => m.id!).filter(Boolean);
    } catch (err: any) {
      result.errors.push(`Gmail list failed: ${err.message}`);
      console.error('[bounceSuppressService] Gmail list error:', err.message);
      return result;
    }

    if (messageIds.length === 0) {
      console.log('[bounceSuppressService] No bounce messages found.');
      return result;
    }

    console.log(`[bounceSuppressService] Found ${messageIds.length} bounce message(s) to process.`);

    for (const msgId of messageIds) {
      try {
        result.processed++;

        // Fetch full message
        const msgResp = await gmail.users.messages.get({
          userId: 'me',
          id: msgId,
          format: 'full',
        });
        const msg = msgResp.data;
        const headers: Array<{ name?: string | null; value?: string | null }> = msg.payload?.headers ?? [];
        const bodyText = extractText(msg.payload ?? {});

        // Extract the bounced address
        const bouncedAddress = extractBouncedAddress(headers, bodyText);

        if (!bouncedAddress) {
          console.warn(`[bounceSuppressService] Could not extract address from message ${msgId} — skipping suppression but will trash.`);
        } else {
          // Upsert into EmailSuppression
          await prisma.emailSuppression.upsert({
            where: { emailAddress: bouncedAddress },
            update: {
              bounceHard: true,
              suppressionReason: 'BOUNCED',
              suppressedAt: new Date(),
            },
            create: {
              emailAddress: bouncedAddress,
              bounceHard: true,
              suppressionReason: 'BOUNCED',
              suppressedAt: new Date(),
            },
          });
          result.suppressed++;
          console.log(`[bounceSuppressService] Suppressed: ${bouncedAddress}`);
        }

        // Move message to Trash regardless — keeps inbox clean
        await gmail.users.messages.trash({ userId: 'me', id: msgId });

      } catch (err: any) {
        const errMsg = `Message ${msgId}: ${err.message}`;
        result.errors.push(errMsg);
        console.error(`[bounceSuppressService] Error processing ${msgId}:`, err.message);
      }
    }

    console.log(
      `[bounceSuppressService] Done. processed=${result.processed} suppressed=${result.suppressed} errors=${result.errors.length}`
    );
    return result;
  },
};
