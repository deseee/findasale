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
 *
 * VINTED (2026-09-23): the same poll pass, same inbox and same session also runs a second
 * search for Vinted's "You sold an item on Vinted" email (vintedSoldEmailDetection.ts), which
 * organizers forward to the same sold-<token> address. Same \Seen idempotency, same
 * leave-unread-on-throw retry, same structured unmatched logging. A failure in one branch's
 * search never stops the other branch from running.
 *
 * MERCARI (2026-09-23): a third search in the same pass for Mercari's "You've made a sale: ..."
 * email (mercariSoldEmailDetection.ts), same rules.
 *
 * POSHMARK + GRAILED (2026-09-23): two more searches in the same pass, same rules.
 * poshmarkSoldEmailDetection.ts handles '"<title>" just sold to <buyer> on Poshmark!' from
 * orders@poshmark.com (research-built, not yet seen live). grailedSoldEmailDetection.ts is
 * PROVISIONAL: help@grailed.com sale-like subjects, committed only when the body carries the
 * GrailedBot "You just sold <title> in Size ..." sentence, otherwise logged as grailed_unparsed.
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
import { processVintedSoldEmail, type VintedSoldEmailResult } from './vintedSoldEmailDetection';
import { processMercariSoldEmail, type MercariSoldEmailResult } from './mercariSoldEmailDetection';
import { processPoshmarkSoldEmail, type PoshmarkSoldEmailResult } from './poshmarkSoldEmailDetection';
import { processGrailedSoldEmail, type GrailedSoldEmailResult } from './grailedSoldEmailDetection';

export interface VintedSoldEmailPollCounts {
  processed: number;
  matched: number;
  unmatched: number;
  ambiguous: number;
  ignored: number;
}

export interface FacebookSoldEmailPollResult {
  processed: number;
  matched: number;
  unmatched: number;
  ignored: number;
  errors: string[];
  /** Vinted sold-email branch (same pass, same inbox). Its errors land in `errors` too. */
  vinted: VintedSoldEmailPollCounts;
  /** Mercari sold-email branch (2026-09-23, same pass, same inbox, same counters shape). */
  mercari: VintedSoldEmailPollCounts;
  /** Poshmark sold-email branch (2026-09-23, research-built). */
  poshmark: VintedSoldEmailPollCounts;
  /** Grailed sold-email branch (2026-09-23, PROVISIONAL). */
  grailed: VintedSoldEmailPollCounts;
}

/** Parsed inbound message: the Facebook shape plus the extra fields the Poshmark branch reads. */
export type ParsedInboundEmail = InboundFacebookOrderEmail & {
  /** Display name of the From address ('' when absent). */
  fromName?: string;
  /** Attachment file names ('' entries dropped). */
  attachmentNames?: string[];
};

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
// 2026-09-23: also "Shipping label for your Marketplace order" -- an accepted-offer sale sends
// only that email (see FACEBOOK_SHIPPING_LABEL_SUBJECT). Both are re-checked exactly downstream.
const FACEBOOK_ORDER_EMAIL_SEARCH_QUERY =
  '(from:noreply@marketplace.facebook.com (subject:"New Marketplace order for" OR subject:"Shipping label for your Marketplace order")) is:unread -in:spam -in:trash';

// Vinted branch: same shape and the same Spam/Trash exclusion. Gmail's subject: is a word match,
// so this also catches look-alikes; processVintedSoldEmail re-checks the exact subject
// ("You sold an item on Vinted") and sender, and only that email can mark anything sold.
const VINTED_SOLD_EMAIL_SEARCH_QUERY =
  '(from:no-reply@vinted.com subject:"You sold an item") is:unread -in:spam -in:trash';

// Mercari branch: "You've made a sale: <title>" from no-reply@alerts.us.mercari.com. Gmail's
// subject: is a word match, so "Transaction canceled" and other siblings can still come back;
// processMercariSoldEmail re-checks the exact sender and subject prefix.
const MERCARI_SOLD_EMAIL_SEARCH_QUERY =
  '(from:no-reply@alerts.us.mercari.com subject:"made a sale") is:unread -in:spam -in:trash';

// Poshmark branch: '"<title>" just sold to <buyer> on Poshmark!' from orders@poshmark.com.
// processPoshmarkSoldEmail re-checks the exact sender and the full subject shape, so shipping
// reminders, offers and promos that slip through the word match are ignored there.
const POSHMARK_SOLD_EMAIL_SEARCH_QUERY =
  '(from:orders@poshmark.com subject:"just sold to") is:unread -in:spam -in:trash';

// Grailed branch (PROVISIONAL): the sale subject is not known yet, so this is wide on purpose;
// processGrailedSoldEmail applies the real subject gate and only commits on a parsed body title.
const GRAILED_SOLD_EMAIL_SEARCH_QUERY =
  '(from:help@grailed.com (subject:sold OR subject:sale)) is:unread -in:spam -in:trash';

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
export async function parseImapMessageToInboundEmail(rawSource: Buffer): Promise<ParsedInboundEmail> {
  const parsed = await simpleParser(rawSource);

  // Use the parsed address only (not the raw "Display Name <addr>" From header line).
  // processFacebookMarketplaceOrderEmail does an EXACT (trimmed, lowercased) match against
  // the bare sender address -- the same shape a structured inbound-parse vendor payload's
  // "from" field would already be in, not a raw MIME header line that may carry a display
  // name Facebook could change at any time.
  const from = parsed.from?.value?.[0]?.address ?? '';
  const fromName = parsed.from?.value?.[0]?.name ?? '';
  const attachmentNames = (parsed.attachments ?? [])
    .map((a: any) => String(a?.filename ?? '').trim())
    .filter((n: string) => n.length > 0);
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

  return {
    from,
    fromName,
    subject,
    links,
    rawBody,
    attachmentNames,
    authenticationResults,
    arcAuthenticationResults,
    recipientAddresses,
  };
}

/** Runs one gmraw search. Returns null (and records the error) on failure so the caller can
 * move on to the other branch instead of aborting the whole pass. */
async function searchUnread(
  client: ImapFlow,
  query: string,
  label: string,
  result: FacebookSoldEmailPollResult,
): Promise<number[] | null> {
  try {
    const found = await client.search({ gmraw: query }, { uid: true });
    let uids = found === false ? [] : found;
    if (uids.length > MAX_UIDS_PER_RUN) {
      console.warn(
        `[facebookMarketplaceEmailPollService] ${label} IMAP search returned ${uids.length} UIDs -- capping at ${MAX_UIDS_PER_RUN} for this run.`
      );
      uids = uids.slice(0, MAX_UIDS_PER_RUN);
    }
    return uids;
  } catch (err: any) {
    const prefix = label === 'Facebook' ? 'IMAP search failed' : `${label} IMAP search failed`;
    result.errors.push(`${prefix}: ${err.message}`);
    console.error(`[facebookMarketplaceEmailPollService] ${label} IMAP search error:`, err.message);
    return null;
  }
}

async function markSeen(client: ImapFlow, uid: number): Promise<void> {
  try {
    await client.messageFlagsAdd([uid], ['\\Seen'], { uid: true });
  } catch (flagErr: any) {
    console.warn(
      `[facebookMarketplaceEmailPollService] Could not mark UID ${uid} \\Seen -- it may be reprocessed next poll:`,
      flagErr.message
    );
  }
}

type TitleEmailOutcome =
  | VintedSoldEmailResult
  | MercariSoldEmailResult
  | PoshmarkSoldEmailResult
  | GrailedSoldEmailResult;

/**
 * One title-matched marketplace branch of the same pass (Vinted, Mercari). Every unread message
 * matching `query` goes through `process`. Same per-message isolation and \Seen rules as the
 * Facebook loop: a throw (including a failed commit) leaves the message unread for retry;
 * matched / unmatched / ambiguous / ignored all mark it \Seen so it is never processed twice.
 */
async function processTitleEmailBatch(
  client: ImapFlow,
  result: FacebookSoldEmailPollResult,
  label: 'Vinted' | 'Mercari' | 'Poshmark' | 'Grailed',
  query: string,
  counts: VintedSoldEmailPollCounts,
  process: (email: ParsedInboundEmail) => Promise<TitleEmailOutcome>,
): Promise<void> {
  const uids = await searchUnread(client, query, label, result);
  if (!uids) return;
  if (uids.length === 0) {
    console.log(`[facebookMarketplaceEmailPollService] No unread ${label} sold emails found.`);
    return;
  }
  console.log(`[facebookMarketplaceEmailPollService] Found ${uids.length} unread ${label} sold email(s) to process.`);

  for (const uid of uids) {
    counts.processed++;
    let outcome: TitleEmailOutcome;
    try {
      const msg: any = await client.fetchOne(uid, { source: true }, { uid: true });
      if (!msg || !msg.source) {
        throw new Error(`IMAP fetchOne returned no source for UID ${uid}`);
      }
      const email = await parseImapMessageToInboundEmail(msg.source as Buffer);
      outcome = await process(email);
    } catch (err: any) {
      result.errors.push(`${label} UID ${uid}: ${err.message}`);
      console.error(
        `[facebookMarketplaceEmailPollService] Error processing ${label} UID ${uid} -- leaving unread for retry on next poll:`,
        err.message
      );
      continue; // do NOT mark \Seen -- next poll retries this message
    }

    switch (outcome.kind) {
      case 'matched':
        counts.matched++;
        console.log(
          `[facebookMarketplaceEmailPollService] MATCHED ${label} UID ${uid}: itemId=${outcome.itemId} soldVia=${outcome.soldVia} result=${outcome.result} alreadySold=${outcome.alreadySold}`
        );
        break;
      case 'unmatched':
        counts.unmatched++;
        console.warn(
          `[facebookMarketplaceEmailPollService] UNMATCHED ${label} sold email -- needs manual reconciliation`,
          { uid, organizerId: outcome.organizerId, itemTitleFromBody: outcome.title, reason: outcome.reason }
        );
        break;
      case 'ambiguous':
        counts.ambiguous++;
        console.warn(
          `[facebookMarketplaceEmailPollService] AMBIGUOUS ${label} sold email -- title matches more than one item, needs manual reconciliation`,
          { uid, organizerId: outcome.organizerId, itemTitleFromBody: outcome.title, candidateCount: outcome.candidateCount, reason: outcome.reason }
        );
        break;
      case 'ignored':
        counts.ignored++;
        console.log(`[facebookMarketplaceEmailPollService] IGNORED ${label} UID ${uid}: ${outcome.reason}`);
        break;
    }

    await markSeen(client, uid);
  }
}

/** Vinted branch: every unread "You sold an item" email from no-reply@vinted.com. */
export async function processVintedBatch(client: ImapFlow, result: FacebookSoldEmailPollResult): Promise<void> {
  await processTitleEmailBatch(client, result, 'Vinted', VINTED_SOLD_EMAIL_SEARCH_QUERY, result.vinted, (email) =>
    processVintedSoldEmail(email),
  );
}

/** Mercari branch (2026-09-23): every unread "You've made a sale: ..." email. */
export async function processMercariBatch(client: ImapFlow, result: FacebookSoldEmailPollResult): Promise<void> {
  await processTitleEmailBatch(client, result, 'Mercari', MERCARI_SOLD_EMAIL_SEARCH_QUERY, result.mercari, (email) =>
    processMercariSoldEmail(email),
  );
}

/** Poshmark branch (2026-09-23, research-built): every unread '"..." just sold to ...' email. */
export async function processPoshmarkBatch(client: ImapFlow, result: FacebookSoldEmailPollResult): Promise<void> {
  await processTitleEmailBatch(client, result, 'Poshmark', POSHMARK_SOLD_EMAIL_SEARCH_QUERY, result.poshmark, (email) =>
    processPoshmarkSoldEmail(email),
  );
}

/** Grailed branch (2026-09-23, PROVISIONAL): unread help@grailed.com sold/sale emails. */
export async function processGrailedBatch(client: ImapFlow, result: FacebookSoldEmailPollResult): Promise<void> {
  await processTitleEmailBatch(client, result, 'Grailed', GRAILED_SOLD_EMAIL_SEARCH_QUERY, result.grailed, (email) =>
    processGrailedSoldEmail(email),
  );
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
    vinted: { processed: 0, matched: 0, unmatched: 0, ambiguous: 0, ignored: 0 },
    mercari: { processed: 0, matched: 0, unmatched: 0, ambiguous: 0, ignored: 0 },
    poshmark: { processed: 0, matched: 0, unmatched: 0, ambiguous: 0, ignored: 0 },
    grailed: { processed: 0, matched: 0, unmatched: 0, ambiguous: 0, ignored: 0 },
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
    const fbUids = await searchUnread(client, FACEBOOK_ORDER_EMAIL_SEARCH_QUERY, 'Facebook', result);
    if (fbUids && fbUids.length === 0) {
      console.log('[facebookMarketplaceEmailPollService] No unread Facebook Marketplace order emails found.');
    } else if (fbUids) {
      console.log(`[facebookMarketplaceEmailPollService] Found ${fbUids.length} unread order email(s) to process.`);
    }

    for (const uid of fbUids ?? []) {
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

      await markSeen(client, uid);
    }

    await processVintedBatch(client, result);
    await processMercariBatch(client, result);
    await processPoshmarkBatch(client, result);
    await processGrailedBatch(client, result);

    console.log(
      `[facebookMarketplaceEmailPollService] Done. processed=${result.processed} matched=${result.matched} unmatched=${result.unmatched} ignored=${result.ignored} ` +
        `vinted.processed=${result.vinted.processed} vinted.matched=${result.vinted.matched} vinted.unmatched=${result.vinted.unmatched} vinted.ambiguous=${result.vinted.ambiguous} vinted.ignored=${result.vinted.ignored} ` +
        `mercari.processed=${result.mercari.processed} mercari.matched=${result.mercari.matched} mercari.unmatched=${result.mercari.unmatched} mercari.ambiguous=${result.mercari.ambiguous} mercari.ignored=${result.mercari.ignored} ` +
        `poshmark.processed=${result.poshmark.processed} poshmark.matched=${result.poshmark.matched} poshmark.unmatched=${result.poshmark.unmatched} poshmark.ambiguous=${result.poshmark.ambiguous} poshmark.ignored=${result.poshmark.ignored} ` +
        `grailed.processed=${result.grailed.processed} grailed.matched=${result.grailed.matched} grailed.unmatched=${result.grailed.unmatched} grailed.ambiguous=${result.grailed.ambiguous} grailed.ignored=${result.grailed.ignored} errors=${result.errors.length}`
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
