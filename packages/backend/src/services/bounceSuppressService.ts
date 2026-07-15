import { google } from 'googleapis';
import { prisma } from '../lib/prisma';

/**
 * Bounce Suppression Service
 *
 * Polls a Gmail mailbox for mailer-daemon / postmaster delivery-failure
 * notifications, extracts the bounced recipient address, upserts it into
 * EmailSuppression, and moves the processed message to Trash.
 *
 * MAILBOX ROUTING (UPDATED 2026-07-15 — see ADR-bounce-suppression-mailbox-fix.md
 * status block dated 2026-06-23/24, S1025/S1030): the original plan below this
 * paragraph (promote find@outreach.finda.sale to a full mailbox) was ABANDONED.
 * The actually-implemented fix instead changed ImprovMX forwarding so
 * outreach@finda.sale bounces route to outreach@outreach.finda.sale (a real
 * Google Workspace inbox), and GMAIL_MAILBOX_REFRESH_TOKEN authenticates
 * outreach@finda.sale (confirmed via users.getProfile 2026-07-15 and a live
 * process-bounces trigger, both showing 0 bounce messages — consistent with
 * clean recent sends, not a misconfigured mailbox). The EXPECTED_BOUNCE_MAILBOX
 * constant below still says find@outreach.finda.sale for historical/self-doc
 * reasons only — it does NOT reflect which account is actually authenticated
 * and should not be used to diagnose a mailbox mismatch. Two Cowork sessions
 * (2026-07-15) wrongly concluded the pipeline was broken from this stale
 * comment before verifying live — don't repeat that; verify via a live
 * process-bounces trigger + Railway logs instead of this paragraph.
 *
 *   The mailbox is selected purely by which refresh token is set in env:
 *   GMAIL_MAILBOX_REFRESH_TOKEN currently holds a gmail.modify-scoped token for
 *   outreach@finda.sale. OUTREACH_BOUNCE_MAILBOX is an OPTIONAL, self-documenting
 *   env var naming the expected mailbox for logging — it is stale (still says
 *   find@outreach.finda.sale) and does NOT change which credential is used.
 *
 * Auth pattern copied from lib/emailService.ts (createGmailClient).
 * Uses the same GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET. The refresh token is
 * GMAIL_MAILBOX_REFRESH_TOKEN (preferred) with GMAIL_REFRESH_TOKEN fallback.
 *
 * Scheduled: daily at 06:00 UTC via GitHub Actions
 * (.github/workflows/pipeline-bounce-suppress.yml → POST /api/internal/jobs/run
 * with job 'process-bounces'). No longer an in-process node-cron job.
 */

// Optional self-documenting expected mailbox (does NOT select the credential —
// the credential is whichever refresh token is set below). Logged for diagnostics.
const EXPECTED_BOUNCE_MAILBOX =
  process.env.OUTREACH_BOUNCE_MAILBOX || 'find@outreach.finda.sale';

interface ProcessResult {
  processed: number;
  suppressed: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Gmail client factory — prefers GMAIL_MAILBOX_REFRESH_TOKEN (needs gmail.modify
// scope to list/get/trash messages). Falls back to GMAIL_REFRESH_TOKEN.
// Same pattern as scripts/outreach-mailbox-ops.js.
//
// IMPORTANT (ADR-bounce-suppression-mailbox-fix): GMAIL_MAILBOX_REFRESH_TOKEN
// MUST authenticate find@outreach.finda.sale (the mailbox bounce DSNs return to).
// If it authenticates any other account, processBounces lists 0 messages forever.
// ---------------------------------------------------------------------------
function createGmailClient() {
  const token = process.env.GMAIL_MAILBOX_REFRESH_TOKEN || process.env.GMAIL_REFRESH_TOKEN;
  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET || !token) {
    throw new Error('[bounceSuppressService] Missing GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, or GMAIL_MAILBOX_REFRESH_TOKEN (or GMAIL_REFRESH_TOKEN)');
  }
  if (!process.env.GMAIL_MAILBOX_REFRESH_TOKEN) {
    console.warn(
      `[bounceSuppressService] GMAIL_MAILBOX_REFRESH_TOKEN not set — falling back to GMAIL_REFRESH_TOKEN. ` +
        `For bounce polling to work this token MUST authenticate ${EXPECTED_BOUNCE_MAILBOX} with gmail.modify scope.`,
    );
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

// ---------------------------------------------------------------------------
// Bounce classification
// ---------------------------------------------------------------------------

type BounceCategory =
  | 'DEAD_MAILBOX'
  | 'NO_MX'
  | 'POLICY_BLOCK'
  | 'TRANSIENT'
  | 'COMPLAINT'
  | 'UNKNOWN';

interface BounceClassification {
  category: BounceCategory;
  statusCode: string | null;
  diagnostic: string | null;
}

/**
 * Inspect the DSN headers + body and classify the bounce so we suppress
 * proportionally: permanent dead-mailbox / no-MX failures get hard-suppressed,
 * while recoverable Google policy blocks (5.7.1 "Message rejected") get a
 * time-boxed retryAfter cooldown instead of a permanent hard suppression.
 */
function classifyBounce(
  headers: Array<{ name?: string | null; value?: string | null }>,
  bodyText: string
): BounceClassification {
  // --- Extract enhanced SMTP status code ---
  // Prefer the DSN Status: header (RFC 3464), else scan the body.
  let statusCode: string | null = null;
  const statusHeader = headers.find(h => h.name?.toLowerCase() === 'status');
  if (statusHeader?.value) {
    const m = statusHeader.value.match(/\b([245]\.\d{1,3}\.\d{1,3})\b/);
    if (m) statusCode = m[1];
  }
  if (!statusCode) {
    const m = bodyText.match(/\b([245]\.\d{1,3}\.\d{1,3})\b/);
    if (m) statusCode = m[1];
  }
  // Fall back to a bare 3-digit SMTP reply code if no enhanced code was found.
  if (!statusCode) {
    const m = bodyText.match(/\b([245]\d{2})\b/);
    if (m) statusCode = m[1];
  }

  // --- Extract diagnostic text ---
  let diagnostic: string | null = null;
  const diagHeader = headers.find(h => h.name?.toLowerCase() === 'diagnostic-code');
  if (diagHeader?.value) {
    diagnostic = diagHeader.value.trim();
  }
  if (!diagnostic) {
    const m = bodyText.match(/the response was:\s*([^\n]+)/i);
    if (m?.[1]) diagnostic = m[1].trim();
  }

  // Combined haystack for keyword classification.
  const hay = `${diagnostic ?? ''}\n${bodyText}`;
  const code = statusCode ?? '';

  // --- Classify (order matters: most specific / most recoverable first) ---

  // TRANSIENT — 4.x.x soft failures and "will retry" language. Never suppress.
  if (/^4\./.test(code) || /delivery incomplete|will retry|temporary|try again/i.test(hay)) {
    return { category: 'TRANSIENT', statusCode, diagnostic };
  }

  // DEAD_MAILBOX — permanent recipient-does-not-exist failures.
  if (
    code === '5.1.1' ||
    /^5\.2\./.test(code) ||
    /user unknown|mailbox (is )?disabled|address (couldn'?t be found|not found)|no such user|recipient.*rejected|does not exist|unable to receive/i.test(hay)
  ) {
    return { category: 'DEAD_MAILBOX', statusCode, diagnostic };
  }

  // NO_MX — domain has no mail server / DNS failure.
  if (/DNS (Error|type)|no MX|MX .*lookup|domain .*not found|nxdomain/i.test(hay)) {
    return { category: 'NO_MX', statusCode, diagnostic };
  }

  // POLICY_BLOCK — recoverable provider policy / content rejection (e.g. Google 5.7.1).
  if (
    /^5\.7\./.test(code) ||
    /message (rejected|blocked)|unsolicited|policy|spam|answer\/69585|content/i.test(hay)
  ) {
    return { category: 'POLICY_BLOCK', statusCode, diagnostic };
  }

  // COMPLAINT — feedback-loop / abuse report.
  if (/complaint|feedback[- ]?loop|abuse report|this is a complaint/i.test(hay)) {
    return { category: 'COMPLAINT', statusCode, diagnostic };
  }

  return { category: 'UNKNOWN', statusCode, diagnostic };
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
// Paginated message listing
// ---------------------------------------------------------------------------

/**
 * List ALL Gmail message IDs matching a query, following nextPageToken until
 * exhausted (or maxPages is hit as a safety cap).
 *
 * BUG FIX (2026-07-03): both processBounces() and reclassifyBounces() previously
 * called gmail.users.messages.list() once with maxResults: 100 and never read
 * listResp.data.nextPageToken -- silently capping every run at the 100 NEWEST
 * matching messages. During the 2026-06-16..06-21 send spike (899 sends, up to
 * ~26% daily bounce rate) this produced well over 100 bounce DSNs; the one-time
 * reclassify-bounces backfill (BQ S1020) only ever touched its first page, which
 * is the direct cause of 125/151 EmailSuppression rows still having
 * classifiedAt = NULL as of 2026-07-03. Fixing here, shared by both callers, so
 * neither can silently truncate again.
 */
async function listAllMessageIds(
  gmail: ReturnType<typeof google.gmail>,
  query: string,
  maxPages = 20 // safety cap: 20 pages * 100 = up to 2,000 messages per run
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  let page = 0;

  do {
    const listResp: any = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 100,
      pageToken,
    });
    const batch = (listResp.data.messages ?? []).map((m: any) => m.id!).filter(Boolean);
    ids.push(...batch);
    pageToken = listResp.data.nextPageToken ?? undefined;
    page++;
  } while (pageToken && page < maxPages);

  if (pageToken) {
    console.warn(
      `[bounceSuppressService] listAllMessageIds: hit maxPages=${maxPages} safety cap for query "${query}" -- more messages may remain unfetched.`
    );
  }

  return ids;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Self-limiting boot-time backfill trigger (2026-07-03, S1065).
 *
 * reclassifyBounces() was historically a manual one-off job (no scheduled
 * trigger, no automatic cron) -- it required someone to hit
 * POST /api/internal/jobs/run with job="reclassify-bounces" and the
 * x-internal-secret header by hand. That's real friction for a job that only
 * ever needs to run until the historical backlog is caught up.
 *
 * This wraps it in a cheap guard: on every server boot, count
 * EmailSuppression rows with classifiedAt still NULL. If zero, do nothing
 * (near-zero cost -- one indexed COUNT query). If any remain, run
 * reclassifyBounces() once. Once the backlog is cleared this becomes a
 * permanent no-op on every future boot, so it's safe to leave wired in
 * rather than removing it after this one use.
 *
 * Fire-and-forget from index.ts's listen() callback -- never blocks server
 * startup, and every internal error is caught here so a Gmail/API failure
 * can't crash the process.
 */
export const bounceSuppressService_runReclassifyBackfillIfNeeded = async (): Promise<void> => {
  try {
    const unclassifiedCount = await prisma.emailSuppression.count({
      where: { classifiedAt: null },
    });

    if (unclassifiedCount === 0) {
      console.log('[bounceSuppressService] Boot check: no unclassified EmailSuppression rows -- skipping backfill.');
      return;
    }

    console.log(
      `[bounceSuppressService] Boot check: ${unclassifiedCount} EmailSuppression row(s) with classifiedAt=NULL -- running one-time reclassify backfill.`
    );
    const result = await bounceSuppressService.reclassifyBounces();
    console.log(
      `[bounceSuppressService] Boot backfill done. processed=${result.processed} updated=${result.suppressed} errors=${result.errors.length}`
    );
    if (result.errors.length > 0) {
      console.warn('[bounceSuppressService] Boot backfill errors:', result.errors.slice(0, 5));
    }
  } catch (err: any) {
    console.error('[bounceSuppressService] Boot backfill check failed (non-fatal, server continues):', err.message);
  }
};

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

    console.log(`[bounceSuppressService] Polling bounce mailbox (expected: ${EXPECTED_BOUNCE_MAILBOX}).`);

    // Search for bounce/failure notifications not yet processed (not in Trash).
    // IMPORTANT: bounce DSNs for outreach land at find@outreach.finda.sale — the
    // refresh token (GMAIL_MAILBOX_REFRESH_TOKEN) MUST authenticate that mailbox,
    // otherwise this list returns 0 every run. The query also matches on subject
    // so DSNs from senders that aren't literally mailer-daemon/postmaster (some
    // providers vary the From) are still caught.
    let messageIds: string[] = [];
    try {
      messageIds = await listAllMessageIds(
        gmail,
        '(from:mailer-daemon OR from:postmaster OR subject:(delivery status OR undeliverable OR "mail delivery" OR "failure notice" OR "returned mail" OR "delivery has failed")) -in:trash'
      );
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

        // SEND-LIMIT NOTICE GUARD (incident 2026-06-21): Google's daily-send-limit
        // notices ("You have reached a limit for sending mail. Your message was not
        // sent.") land in the sender mailbox and carry NO bounced recipient. They are
        // a throttle signal, NOT a recipient delivery failure — must never create a
        // suppression. The last-resort body email scan could otherwise latch onto a
        // stray address and wrongly suppress it. Skip suppression (still trash + log).
        const subjectHeader = headers.find(h => h.name?.toLowerCase() === 'subject');
        const sendLimitHaystack = `${subjectHeader?.value ?? ''}\n${bodyText}`;
        if (/reached a limit for sending|sending limit|message was not sent because you have reached/i.test(sendLimitHaystack)) {
          console.log(`[bounceSuppressService] Send-limit notice (no recipient bounce) for message ${msgId} — not suppressing.`);
          try {
            await gmail.users.messages.trash({ userId: 'me', id: msgId });
          } catch (trashErr: any) {
            console.warn(`[bounceSuppressService] Could not trash send-limit notice ${msgId} — continuing:`, trashErr.message);
          }
          continue;
        }

        // Extract the bounced address
        const bouncedAddress = extractBouncedAddress(headers, bodyText);

        if (!bouncedAddress) {
          console.warn(`[bounceSuppressService] Could not extract address from message ${msgId} — skipping suppression but will trash.`);
        } else {
          // Classify the bounce so suppression is proportional to the real cause.
          const { category, statusCode, diagnostic } = classifyBounce(headers, bodyText);
          const diagnosticCode = diagnostic ? diagnostic.slice(0, 500) : null;

          if (category === 'TRANSIENT') {
            // Recoverable soft failure — do NOT suppress. Just trash + log.
            console.log(`[bounceSuppressService] TRANSIENT bounce for ${bouncedAddress} (${statusCode ?? 'no-code'}) — not suppressing.`);
          } else {
            const now = new Date();

            // Category-driven suppression fields.
            let bounceHard = false;
            let retryAfter: Date | null = null;
            let complaintEmail: Date | null = null;

            if (category === 'DEAD_MAILBOX' || category === 'NO_MX') {
              bounceHard = true;
              retryAfter = null;
            } else if (category === 'POLICY_BLOCK') {
              const cooldownDays = Number(process.env.POLICY_BLOCK_COOLDOWN_DAYS || 7);
              retryAfter = new Date(Date.now() + cooldownDays * 86400000);
            } else if (category === 'UNKNOWN') {
              retryAfter = new Date(Date.now() + 3 * 86400000);
            } else if (category === 'COMPLAINT') {
              complaintEmail = now;
            }

            const fields = {
              bounceHard,
              retryAfter,
              ...(complaintEmail ? { complaintEmail } : {}),
              bounceCategory: category,
              bounceStatusCode: statusCode,
              diagnosticCode,
              classifiedAt: now,
              suppressionReason: category,
              suppressedAt: now,
            };

            await prisma.emailSuppression.upsert({
              where: { emailAddress: bouncedAddress },
              update: fields,
              create: { emailAddress: bouncedAddress, ...fields },
            });
            result.suppressed++;
            console.log(`[bounceSuppressService] Suppressed: ${bouncedAddress} category=${category} code=${statusCode ?? 'none'}`);
          }
        }

        // Move message to Trash regardless — keeps inbox clean.
        // Isolated try/catch: trash requires gmail.modify scope. If the token is
        // read-only this throws, but it must NEVER block the suppression upsert
        // above — log and continue.
        try {
          await gmail.users.messages.trash({ userId: 'me', id: msgId });
        } catch (trashErr: any) {
          console.warn(`[bounceSuppressService] Could not trash ${msgId} (likely missing gmail.modify scope) — continuing:`, trashErr.message);
        }

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

  /**
   * Backfill: re-classify historical bounce DSNs (including those already moved
   * to Trash — Gmail retains trash ~30 days) and repair existing EmailSuppression
   * rows that were blanket hard-suppressed with the old `bounceHard: true` logic.
   *
   * - Recovers POLICY_BLOCK rows: bounceHard=false, retryAfter=now+cooldown.
   * - Keeps DEAD_MAILBOX / NO_MX rows hard-suppressed.
   * - Only UPDATES existing rows (updateMany) — never creates new rows, so a DSN
   *   for an address with no suppression row is a harmless no-op.
   * - Does NOT trash any messages.
   */
  async reclassifyBounces(): Promise<ProcessResult> {
    const result: ProcessResult = { processed: 0, suppressed: 0, errors: [] };

    let gmail: ReturnType<typeof google.gmail>;
    try {
      gmail = createGmailClient();
    } catch (err: any) {
      result.errors.push(`Gmail auth failed: ${err.message}`);
      console.error('[bounceSuppressService] reclassify Gmail auth error:', err.message);
      return result;
    }

    let messageIds: string[] = [];
    try {
      messageIds = await listAllMessageIds(
        gmail,
        '(from:mailer-daemon OR from:postmaster OR subject:(delivery status OR undeliverable OR "mail delivery" OR "failure notice" OR "returned mail")) in:anywhere'
      );
    } catch (err: any) {
      result.errors.push(`Gmail list failed: ${err.message}`);
      console.error('[bounceSuppressService] reclassify Gmail list error:', err.message);
      return result;
    }

    if (messageIds.length === 0) {
      console.log('[bounceSuppressService] reclassify: no bounce messages found.');
      return result;
    }

    console.log(`[bounceSuppressService] reclassify: found ${messageIds.length} message(s) to re-classify.`);

    for (const msgId of messageIds) {
      try {
        result.processed++;

        const msgResp = await gmail.users.messages.get({
          userId: 'me',
          id: msgId,
          format: 'full',
        });
        const msg = msgResp.data;
        const headers: Array<{ name?: string | null; value?: string | null }> = msg.payload?.headers ?? [];
        const bodyText = extractText(msg.payload ?? {});

        const bouncedAddress = extractBouncedAddress(headers, bodyText);
        if (!bouncedAddress) {
          continue;
        }

        const { category, statusCode, diagnostic } = classifyBounce(headers, bodyText);
        const diagnosticCode = diagnostic ? diagnostic.slice(0, 500) : null;
        const now = new Date();

        const data: Record<string, unknown> = {
          bounceCategory: category,
          bounceStatusCode: statusCode,
          diagnosticCode,
          classifiedAt: now,
        };

        if (category === 'POLICY_BLOCK') {
          // Recover the row: lift the permanent hard suppression, apply a cooldown.
          const cooldownDays = Number(process.env.POLICY_BLOCK_COOLDOWN_DAYS || 7);
          data.bounceHard = false;
          data.retryAfter = new Date(Date.now() + cooldownDays * 86400000);
        } else if (category === 'DEAD_MAILBOX' || category === 'NO_MX') {
          // Confirmed permanent — keep hard-suppressed.
          data.bounceHard = true;
        }
        // TRANSIENT / COMPLAINT / UNKNOWN: only record the classification metadata,
        // leave the existing bounceHard/retryAfter state untouched in the backfill.

        // updateMany so a missing row is a no-op (never creates new rows).
        const updated = await prisma.emailSuppression.updateMany({
          where: { emailAddress: bouncedAddress },
          data,
        });
        if (updated.count > 0) {
          result.suppressed += updated.count;
          console.log(`[bounceSuppressService] reclassify: ${bouncedAddress} -> ${category} (rows=${updated.count})`);
        }
      } catch (err: any) {
        const errMsg = `Message ${msgId}: ${err.message}`;
        result.errors.push(errMsg);
        console.error(`[bounceSuppressService] reclassify error processing ${msgId}:`, err.message);
      }
    }

    console.log(
      `[bounceSuppressService] reclassify done. processed=${result.processed} updated=${result.suppressed} errors=${result.errors.length}`
    );
    return result;
  },
};
