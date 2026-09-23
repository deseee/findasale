/**
 * facebookMarketplaceEmailPollService.ts — IMAP polling for Facebook Marketplace
 * order-confirmation emails (ADR-131: Facebook Marketplace Sold Detection via
 * Order-Confirmation Email).
 *
 * WHAT THIS IS: the transport/ingestion layer only. Connects to a real Google Workspace
 * mailbox (outreach@finda.sale) over IMAP using a Gmail App Password (NOT OAuth — same
 * rationale as bounceSuppressService.ts's IMAP path, see
 * claude_docs/feature-notes/ADR-bounce-polling-imap-app-password-2026-09-04.md: App
 * Passwords don't expire on a schedule the way a restricted-scope OAuth refresh token
 * does), finds unread Facebook Marketplace order-confirmation emails, parses each one
 * into the shape processFacebookMarketplaceOrderEmail() expects, and hands it off. This
 * file deliberately does NOT duplicate any of that function's sender/subject filtering,
 * listing_id extraction, MarketplaceListingJob matching, or fail-closed unmatched
 * handling — see facebookMarketplaceEmailSoldDetection.ts for all of that.
 *
 * Connection/search/fetch shape mirrors bounceSuppressService.ts's createImapBounceSession
 * (same already-debugged imap.gmail.com IMAP pattern, same imapflow + mailparser deps,
 * already in packages/backend/package.json for that service) — deliberately not
 * reinvented here, just re-applied against a different mailbox/sender/subject.
 *
 * ENV VARS (new Railway production vars, per the 2026-09-20 vendor decision — a real
 * Google Workspace mailbox + domain catch-all rule instead of a third-party inbound-email
 * vendor):
 *   FACEBOOK_SOLD_IMAP_USER          — outreach@finda.sale
 *   FACEBOOK_SOLD_IMAP_APP_PASSWORD  — Gmail App Password for that mailbox
 *
 * IDEMPOTENCY — deliberate divergence from bounceSuppressService.ts: that service moves
 * every processed bounce DSN to Trash, because a bounce DSN is disposable once recorded.
 * A Facebook order-confirmation email is a genuine business record (proof a real sale
 * happened) that Patrick or an organizer may need to find again later, so this service
 * does NOT trash anything. Instead, per ADR-131 §3's own idempotency guidance ("mark each
 * \Seen ... or move to a dedicated label"), it marks each fully-handled message \Seen and
 * leaves it in place. A message whose processing threw (vs. resolving to
 * matched/unmatched/ignored) is deliberately left unread so the next poll retries it.
 */

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import * as cheerio from 'cheerio';
import {
  processFacebookMarketplaceOrderEmail,
  type InboundFacebookOrderEmail,
  type FacebookOrderEmailResult,
} from './facebookMarketplaceEmailSoldDetection';
import { headerValues, extractAddresses, type RawHeaderLine } from './inboundEmailAuthService';

export interface FacebookSoldEmailPollResult {
  processed: number;
  matched: number;
  unmatched: number;
  ignored: number;
  errors: string[];
}

// Gmail's IMAP server accepts its own web search syntax via the X-GM-RAW extension
// (same "gmraw" mechanism bounceSuppressService.ts already uses) — from:/subject: filter
// down to just the order-placed sibling before processFacebookMarketplaceOrderEmail's own
// exact sender/subject check runs. "is:unread" replaces a separate UNSEEN IMAP search key
// so the one query string does both the content filter and the not-yet-processed filter.
// SECURITY (2026-09-23 review): deliberately NOT "in:anywhere" (unlike
// bounceSuppressService). Spam is exactly where spoofed "Facebook" order emails land, and
// a message here can mark an item sold -- so Spam and Trash are explicitly excluded. A
// genuine order email Gmail misfiles as Spam must be moved out by a human (Not spam) to
// be processed; that is the intended fail-closed trade-off.
const FACEBOOK_ORDER_EMAIL_SEARCH_QUERY =
  '(from:noreply@marketplace.facebook.com subject:"New Marketplace order for") is:unread -in:spam -in:trash';

// Safety cap, same idea as bounceSuppressService's 2000-UID cap — pure defense-in-depth.
// Real volume here is roughly one email every few weeks per ADR-131, so this should never
// actually bind; it exists only so a search-query regression can't process an unbounded
// backlog in a single run.
const MAX_UIDS_PER_RUN = 500;

interface ImapSession {
  client: ImapFlow;
  lock: Awaited<ReturnType<ImapFlow['getMailboxLock']>>;
}

export async function openImapSession(): Promise<ImapSession> {
  const user = process.env.FACEBOOK_SOLD_IMAP_USER;
  const pass = process.env.FACEBOOK_SOLD_IMAP_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error('Missing FACEBOOK_SOLD_IMAP_USER or FACEBOOK_SOLD_IMAP_APP_PASSWORD');
  }

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  await client.connect();

  // "All Mail" is just the connection's home mailbox for SEARCH/FETCH below — same idiom
  // as bounceSuppressService.ts. The actual folder scope is controlled by the gmraw
  // query's own "-in:spam -in:trash" above, not by which mailbox this lock is taken
  // against (All Mail itself never contains Spam/Trash in Gmail's IMAP model).
  const lock = await client.getMailboxLock('[Gmail]/All Mail');

  return { client, lock };
}

function extractLinksFromHtml(html: string): string[] {
  try {
    const $ = cheerio.load(html);
    const hrefs: string[] = [];
    $('a[href]').each((_i, el) => {
      const href = $(el).attr('href');
      if (href) hrefs.push(href);
    });
    return hrefs;
  } catch (err: any) {
    console.warn(
      '[facebookMarketplaceEmailPollService] Failed to parse HTML body for <a href> links -- falling back to rawBody scan:',
      err.message
    );
    return [];
  }
}

/**
 * Parses one already-fetched raw RFC822 message (as returned by ImapFlow's
 * fetchOne(..., { source: true })) into the InboundFacebookOrderEmail shape
 * processFacebookMarketplaceOrderEmail() expects. Exported so this mapping is unit
 * testable without a live IMAP connection.
 */
export async function parseImapMessageToInboundEmail(rawSource: Buffer): Promise<InboundFacebookOrderEmail> {
  const parsed = await simpleParser(rawSource);

  // Use the parsed address only (not the raw "Display Name <addr>" From header line).
  // processFacebookMarketplaceOrderEmail does an EXACT (trimmed, lowercased) match against
  // the bare sender address -- the same shape a structured inbound-parse vendor payload's
  // "from" field would already be in, not a raw MIME header line that may carry a display
  // name Facebook could change at any time.
  const from = parsed.from?.value?.[0]?.address ?? '';
  const subject = parsed.subject ?? '';

  const htmlBody = typeof parsed.html === 'string' ? parsed.html : null;
  const links = htmlBody ? extractLinksFromHtml(htmlBody) : [];

  // rawBody fallback covers (1) a plain-text-only message (no HTML part -- parsed.text)
  // and (2) an HTML part present but link-extraction above found nothing usable, so
  // processFacebookMarketplaceOrderEmail's own regex-over-text extraction still gets a
  // shot at the same listing_id=(\d+) pattern directly against the raw HTML text.
  const rawBody = htmlBody ?? parsed.text ?? undefined;

  // Sender-authentication + recipient-routing headers, in message order (topmost first),
  // for processFacebookMarketplaceOrderEmail's DKIM/DMARC check and organizer scoping
  // (and reused as-is by gmailForwardingAutoConfirmService's DKIM check).
  const headerLines = (parsed as any).headerLines as RawHeaderLine[] | undefined;
  const authenticationResults = headerValues(headerLines, 'authentication-results');
  const arcAuthenticationResults = headerValues(headerLines, 'arc-authentication-results');
  const recipientAddresses = Array.from(
    new Set(
      ['delivered-to', 'x-original-to', 'x-forwarded-to', 'to'].flatMap((name) =>
        headerValues(headerLines, name).flatMap(extractAddresses),
      ),
    ),
  );

  return { from, subject, links, rawBody, authenticationResults, arcAuthenticationResults, recipientAddresses };
}

/**
 * Polls FACEBOOK_SOLD_IMAP_USER's inbox for unread Facebook Marketplace order-
 * confirmation emails and runs each one through processFacebookMarketplaceOrderEmail.
 *
 * Every message is processed independently: a single malformed email, or a downstream
 * failure processing one message, is caught and logged without aborting the rest of the
 * batch (mirrors bounceSuppressService.processBounces()'s per-message isolation). The
 * whole run is itself wrapped so an IMAP auth/connect/search failure can never throw out
 * of this function -- it is recorded in the returned result's `errors` array instead, for
 * cronGuard/Sentry to see via the caller.
 */
export async function pollFacebookMarketplaceSoldEmails(): Promise<FacebookSoldEmailPollResult> {
  const result: FacebookSoldEmailPollResult = {
    processed: 0,
    matched: 0,
    unmatched: 0,
    ignored: 0,
    errors: [],
  };

  let session: ImapSession;
  try {
    session = await openImapSession();
  } catch (err: any) {
    result.errors.push(`IMAP auth/connect failed: ${err.message}`);
    console.error('[facebookMarketplaceEmailPollService] IMAP auth/connect error:', err.message);
    return result;
  }

  const { client, lock } = session;

  try {
    let uids: number[] = [];
    try {
      const found = await client.search({ gmraw: FACEBOOK_ORDER_EMAIL_SEARCH_QUERY }, { uid: true });
      uids = found === false ? [] : found;
      if (uids.length > MAX_UIDS_PER_RUN) {
        console.warn(
          `[facebookMarketplaceEmailPollService] IMAP search returned ${uids.length} UIDs -- capping at ${MAX_UIDS_PER_RUN} for this run.`
        );
        uids = uids.slice(0, MAX_UIDS_PER_RUN);
      }
    } catch (err: any) {
      result.errors.push(`IMAP search failed: ${err.message}`);
      console.error('[facebookMarketplaceEmailPollService] IMAP search error:', err.message);
      return result;
    }

    if (uids.length === 0) {
      console.log('[facebookMarketplaceEmailPollService] No unread Facebook Marketplace order emails found.');
      return result;
    }

    console.log(`[facebookMarketplaceEmailPollService] Found ${uids.length} unread order email(s) to process.`);

    for (const uid of uids) {
      result.processed++;
      let outcome: FacebookOrderEmailResult;

      try {
        const msg: any = await client.fetchOne(uid, { source: true }, { uid: true });
        if (!msg || !msg.source) {
          throw new Error(`IMAP fetchOne returned no source for UID ${uid}`);
        }
        const email = await parseImapMessageToInboundEmail(msg.source as Buffer);
        outcome = await processFacebookMarketplaceOrderEmail(email);
      } catch (err: any) {
        const errMsg = `UID ${uid}: ${err.message}`;
        result.errors.push(errMsg);
        console.error(
          `[facebookMarketplaceEmailPollService] Error processing UID ${uid} -- leaving unread for retry on next poll:`,
          err.message
        );
        continue; // do NOT mark \Seen -- next poll retries this message
      }

      switch (outcome.kind) {
        case 'matched':
          result.matched++;
          console.log(
            `[facebookMarketplaceEmailPollService] MATCHED UID ${uid}: itemId=${outcome.itemId} remoteListingId=${outcome.remoteListingId} soldVia=${outcome.soldVia} alreadyCommitted=${outcome.alreadyCommitted}`
          );
          break;
        case 'unmatched':
          result.unmatched++;
          // Structured warning per ADR-131 §3's fail-closed edge case. Deliberately no
          // notification/alert sent here -- that is separate, explicitly out-of-scope
          // follow-up work (a Patrick-facing digest/alert, per the ADR's own "Flagged for
          // Patrick" section). This log line carries everything a human needs to
          // reconcile manually: the item title parsed from the subject, Facebook's own
          // order id, the listing_id (if any was extracted), and why it didn't match.
          console.warn(
            '[facebookMarketplaceEmailPollService] UNMATCHED Facebook Marketplace order email -- needs manual reconciliation',
            {
              uid,
              itemTitleFromSubject: outcome.itemTitleFromSubject,
              remoteOrderId: outcome.remoteOrderId,
              remoteListingId: outcome.remoteListingId,
              reason: outcome.reason,
            }
          );
          break;
        case 'ignored':
          result.ignored++;
          // Shouldn't normally occur -- the IMAP search query above already filters on
          // sender+subject -- but Gmail's search syntax does substring/partial subject
          // matching, so a sibling email (offer/shipping-label/delivery) with "New
          // Marketplace order for" appearing elsewhere is a theoretical possibility.
          // processFacebookMarketplaceOrderEmail's own exact re-check is what actually
          // protects against that; this is just visibility into it happening.
          console.log(`[facebookMarketplaceEmailPollService] IGNORED UID ${uid}: ${outcome.reason}`);
          break;
      }

      try {
        await client.messageFlagsAdd([uid], ['\\Seen'], { uid: true });
      } catch (flagErr: any) {
        console.warn(
          `[facebookMarketplaceEmailPollService] Could not mark UID ${uid} \\Seen -- it may be reprocessed next poll:`,
          flagErr.message
        );
      }
    }

    console.log(
      `[facebookMarketplaceEmailPollService] Done. processed=${result.processed} matched=${result.matched} unmatched=${result.unmatched} ignored=${result.ignored} errors=${result.errors.length}`
    );
    return result;
  } finally {
    try {
      lock.release();
    } catch {
      // already released or connection gone -- non-fatal
    }
    try {
      await client.logout();
    } catch {
      client.close();
    }
  }
}
