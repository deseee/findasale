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
 * poshmarkSoldEmailDetection.ts handles '<title> just sold to <buyer> on Poshmark!' from
 * orders@poshmark.com (seen live 2026-10-28; title quoted or not). grailedSoldEmailDetection.ts is
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
import { processVintedSoldEmail, inspectVintedBundleEmail, type VintedSoldEmailResult } from './vintedSoldEmailDetection';
import { processVintedSoldTitleReportTokenMatchOnly } from './vintedSoldDetectionService';
import { processMercariSoldEmail, type MercariSoldEmailResult } from './mercariSoldEmailDetection';
import { processPoshmarkSoldEmail, type PoshmarkSoldEmailResult } from './poshmarkSoldEmailDetection';
import { processGrailedSoldEmail, type GrailedSoldEmailResult } from './grailedSoldEmailDetection';
import { prisma } from '../lib/prisma';
import { runWithSoldEmailSource } from './soldEmailSourceGuard';
import { createNotification } from '../lib/notificationService';
import {
  notifyOrganizerVintedBundleSale,
  listBundleNoticesMissingConversation,
  attachConversationToNotice,
  parseBundleNoticeLink,
  type BundleNoticeRow,
} from './vintedBundleSaleService';

/**
 * S-VINTED-BCW-AMBIGUOUS-SILENT-DROP (2026-10-10, Patrick live report: "BCW tubes and pages"
 * sold-on-Vinted items never closing out). Root cause: an 'unmatched'/'ambiguous' title-email
 * outcome was only ever console.warn'd (text a human would only see by tailing server logs) and
 * then the email was marked \Seen -- permanently dropped, never retried, never surfaced to the
 * organizer. Organizers who list several near-identical items (same brand/product, e.g. multiple
 * "BCW Trading Card Pages" listings) hit the title-collision 'ambiguous' case routinely, since
 * title matching is deliberately exact-and-unique-only (it never guesses which item sold -- that
 * safety behavior is correct and is NOT changed here). This at least gets a real notification in
 * front of the organizer so they can resolve it (rename one of the colliding titles so future
 * sales match uniquely, or mark the item sold manually) instead of the sale silently vanishing.
 * Best-effort: never throws, never blocks the \Seen mark or the rest of the poll.
 */
async function notifyOrganizerVintedReconciliationNeeded(
  label: 'Vinted' | 'Mercari' | 'Poshmark' | 'Grailed',
  organizerId: string,
  title: string | null,
  detail: string,
): Promise<void> {
  try {
    const organizer = await prisma.organizer.findUnique({ where: { id: organizerId }, select: { userId: true } });
    if (!organizer?.userId) return;
    await createNotification({
      userId: organizer.userId,
      type: 'sold_email_needs_reconciliation',
      title: `A ${label} sale needs your attention`,
      body: `We received a "sold" notice for ${title ? `"${title}"` : "an item"} on ${label}, but ${detail}. This item was NOT automatically marked sold or removed from your other listings -- please find it and update it yourself (or rename it if another listing shares its exact title) so future sales match correctly.`,
      link: '/organizer/inventory',
      channel: 'OPERATIONAL',
      sendEmail: true,
    });
  } catch (err: any) {
    console.error(`[facebookMarketplaceEmailPollService] Failed to notify organizer ${organizerId} of ${label} reconciliation need:`, err?.message || err);
  }
}

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

// 2026-10-12 (Vinted bundle sale never processed): the four title-matched branches below (Vinted, Mercari,
// Poshmark, Grailed) no longer depend on "is:unread". An email a human already opened in Gmail was invisible to
// the poller forever, and the first live Vinted bundle sale produced "No unread Vinted sold emails found". They now
// search a recent window regardless of read state and dedupe on a persisted marker instead: one
// ProcessedWebhookEvent row (eventId "sold-email:<Label>:<Message-ID>", status COMPLETED, pruned after 30 days by
// webhookEventPruneJob) per handled message. No schema change. A message whose processing THREW has no marker, so
// the next poll retries it. The Facebook branch above is unchanged (still is:unread).
export const SOLD_EMAIL_WINDOW_DAYS = 3;
const SOLD_EMAIL_WINDOW_TERM = `newer_than:${SOLD_EMAIL_WINDOW_DAYS}d`;
export const SOLD_EMAIL_EVENT_PREFIX = 'sold-email:';

// Per-branch marker revision. A processed marker is permanent for the window, so a message a branch
// IGNORED because its parser did not recognise the real template is never looked at again, even after
// the parser is fixed. Bumping a branch's revision here makes the next poll re-examine every message
// of that branch still in the window, once. Re-examining is safe: matched sales are idempotent
// (commit dedupe + order id), and a previously-read message is never re-notified as unmatched.
// Poshmark r2 (2026-10-29): the first live sale email (2026-10-28, Message-ID
// <Fw0djysIQYCJc1Qygku-8A@geopod-ismtpd-16>) was ignored by the research-built quoted-title parser.
export const SOLD_EMAIL_KEY_REVISION: Readonly<Record<string, string>> = { Poshmark: 'r2' };

// Vinted branch: same shape and the same Spam/Trash exclusion. 2026-10-12: NO subject filter any more -- the real
// bundle subject was never observed, and a subject: word match that misses it hides the email completely. Every
// Vinted email in the window is looked at ONCE (then marked processed); processVintedSoldEmail re-checks the exact
// subject and sender and logs the subject of every email it rejects. Only the sold / bundle emails can do anything.
const VINTED_SOLD_EMAIL_SEARCH_QUERY =
  `(from:no-reply@vinted.com) ${SOLD_EMAIL_WINDOW_TERM} -in:spam -in:trash`;

// Mercari branch: "You've made a sale: <title>" from no-reply@alerts.us.mercari.com. Gmail's
// subject: is a word match, so "Transaction canceled" and other siblings can still come back;
// processMercariSoldEmail re-checks the exact sender and subject prefix.
const MERCARI_SOLD_EMAIL_SEARCH_QUERY =
  `(from:no-reply@alerts.us.mercari.com subject:"made a sale") ${SOLD_EMAIL_WINDOW_TERM} -in:spam -in:trash`;

// Poshmark branch: '<title> just sold to <buyer> on Poshmark!' from orders@poshmark.com (live
// 2026-10-28 shape has no quotes; the subject: phrase match below does not depend on them).
// processPoshmarkSoldEmail re-checks the exact sender and the full subject shape, so shipping
// reminders, offers and promos that slip through the word match are ignored there.
const POSHMARK_SOLD_EMAIL_SEARCH_QUERY =
  `(from:orders@poshmark.com subject:"just sold to") ${SOLD_EMAIL_WINDOW_TERM} -in:spam -in:trash`;

// Grailed branch (PROVISIONAL): the sale subject is not known yet, so this is wide on purpose;
// processGrailedSoldEmail applies the real subject gate and only commits on a parsed body title.
const GRAILED_SOLD_EMAIL_SEARCH_QUERY =
  `(from:help@grailed.com (subject:sold OR subject:sale)) ${SOLD_EMAIL_WINDOW_TERM} -in:spam -in:trash`;

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

export interface WindowMessageInfo {
  uid: number;
  /** Envelope Date header, else IMAP INTERNALDATE; null when neither is available. Feeds soldEmailSourceGuard. */
  sentAt?: Date | null;
  /** Gmail/RFC822 Message-ID header (envelope), null when absent. */
  messageId: string | null;
  seen: boolean;
}

/** Deterministic idempotency key for one message of one branch. Exported for tests. */
export function soldEmailEventKey(label: string, info: Pick<WindowMessageInfo, 'uid' | 'messageId'>): string {
  const id = info.messageId ? String(info.messageId).trim().slice(0, 400) : '';
  const rev = SOLD_EMAIL_KEY_REVISION[label];
  return `${SOLD_EMAIL_EVENT_PREFIX}${label}:${rev ? `${rev}:` : ''}${id || `uid:${info.uid}`}`;
}

function toValidDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null;
  const d = v instanceof Date ? v : new Date(v as any);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Envelope + flags for the searched UIDs (one IMAP FETCH, no bodies). Returns null on failure. */
async function fetchWindowMessageInfo(
  client: ImapFlow,
  uids: number[],
  label: string,
  result: FacebookSoldEmailPollResult,
): Promise<WindowMessageInfo[] | null> {
  try {
    const out: WindowMessageInfo[] = [];
    for await (const msg of client.fetch(uids, { uid: true, envelope: true, flags: true, internalDate: true }, { uid: true })) {
      const m: any = msg;
      out.push({
        uid: Number(m.uid),
        messageId: m.envelope?.messageId ? String(m.envelope.messageId) : null,
        sentAt: toValidDate(m.envelope?.date) ?? toValidDate(m.internalDate),
        seen: m.flags instanceof Set ? m.flags.has('\\Seen') : Array.isArray(m.flags) ? m.flags.includes('\\Seen') : false,
      });
    }
    // A UID the FETCH did not return is still processed (keyed by UID), never silently dropped.
    const got = new Set(out.map((o) => o.uid));
    for (const uid of uids) if (!got.has(uid)) out.push({ uid, messageId: null, seen: false });
    return out.sort((a, b) => a.uid - b.uid);
  } catch (err: any) {
    result.errors.push(`${label} IMAP envelope fetch failed: ${err.message}`);
    console.error(`[facebookMarketplaceEmailPollService] ${label} IMAP envelope fetch error:`, err.message);
    return null;
  }
}

/** Which of `keys` already have a processed marker. Throws on a DB failure (the caller then processes nothing). */
async function loadProcessedKeys(keys: string[]): Promise<Set<string>> {
  if (!keys.length) return new Set();
  const rows = await prisma.processedWebhookEvent.findMany({ where: { eventId: { in: keys } }, select: { eventId: true } });
  return new Set(rows.map((r: { eventId: string }) => r.eventId));
}

/** Writes the processed marker. true = this call created it, false = it already existed (or could not be written). */
async function claimProcessed(key: string): Promise<boolean> {
  try {
    await prisma.processedWebhookEvent.create({ data: { eventId: key, status: 'COMPLETED' } });
    return true;
  } catch (err: any) {
    if (err?.code === 'P2002') return false; // unique violation: already marked
    console.warn(`[facebookMarketplaceEmailPollService] Could not write processed marker ${key} -- message may be re-examined next poll:`, err?.message || err);
    return false;
  }
}

/**
 * One title-matched marketplace branch of the same pass (Vinted, Mercari, ...). Every message in the
 * recent window matching `query` (read OR unread) goes through `process` exactly once: handled
 * messages get a persisted processed marker (claimProcessed) and are skipped on later polls. Same
 * per-message isolation as the Facebook loop: a throw (including a failed commit) leaves NO marker so
 * the next poll retries; matched / unmatched / ambiguous / bundle / ignored all mark the message so it
 * is never processed twice. Notifications are claimed BEFORE they are sent, so a crash between the two
 * can never produce a second notification for the same email.
 *
 * A message that was already \Seen and has no marker predates this change (the old unread-only flow
 * handled it, or a human opened it): it is processed once so a missed sale is caught, but an
 * unmatched / ambiguous outcome for it is only logged, not notified, to avoid re-notifying the last
 * days of old reconciliation notices on first deploy. A bundle outcome is always notified.
 */
async function processTitleEmailBatch(
  client: ImapFlow,
  result: FacebookSoldEmailPollResult,
  label: 'Vinted' | 'Mercari' | 'Poshmark' | 'Grailed',
  query: string,
  counts: VintedSoldEmailPollCounts,
  process: (email: ParsedInboundEmail) => Promise<TitleEmailOutcome>,
): Promise<void> {
  const found = await searchUnread(client, query, label, result);
  if (!found) return;
  if (found.length === 0) {
    console.log(`[facebookMarketplaceEmailPollService] No ${label} sold-candidate emails in the last ${SOLD_EMAIL_WINDOW_DAYS} days.`);
    return;
  }
  const infos = await fetchWindowMessageInfo(client, found, label, result);
  if (!infos) return;
  let done: Set<string>;
  try {
    done = await loadProcessedKeys(infos.map((i) => soldEmailEventKey(label, i)));
  } catch (err: any) {
    // Fail closed: without the marker table we cannot tell new from handled, so process nothing this run.
    result.errors.push(`${label} processed-marker lookup failed: ${err.message}`);
    console.error(`[facebookMarketplaceEmailPollService] ${label} processed-marker lookup failed -- skipping this run:`, err.message);
    return;
  }
  const fresh = infos.filter((i) => !done.has(soldEmailEventKey(label, i)));
  if (fresh.length === 0) {
    console.log(`[facebookMarketplaceEmailPollService] No new ${label} sold-candidate emails (${found.length} in window, all already processed).`);
    return;
  }
  console.log(`[facebookMarketplaceEmailPollService] Found ${fresh.length} new ${label} sold-candidate email(s) to process (${found.length} in window).`);

  for (const info of fresh) {
    const uid = info.uid;
    const key = soldEmailEventKey(label, info);
    counts.processed++;
    let outcome: TitleEmailOutcome;
    try {
      const msg: any = await client.fetchOne(uid, { source: true }, { uid: true });
      if (!msg || !msg.source) {
        throw new Error(`IMAP fetchOne returned no source for UID ${uid}`);
      }
      const email = await parseImapMessageToInboundEmail(msg.source as Buffer);
      // 2026-10-12: the sale commit below this call can see WHICH e-mail it came from (replay / relist guard).
      outcome = await runWithSoldEmailSource({ key, sentAt: info.sentAt ?? null }, () => process(email));
    } catch (err: any) {
      result.errors.push(`${label} UID ${uid}: ${err.message}`);
      console.error(
        `[facebookMarketplaceEmailPollService] Error processing ${label} UID ${uid} -- no processed marker written, retrying on next poll:`,
        err.message
      );
      continue; // no marker -> next poll retries this message
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
          { uid, organizerId: outcome.organizerId, itemTitleFromBody: outcome.title, reason: outcome.reason, previouslySeen: info.seen }
        );
        if (!info.seen && (await claimProcessed(key))) {
          await notifyOrganizerVintedReconciliationNeeded(
            label,
            outcome.organizerId,
            outcome.title,
            "we couldn't find a matching listing for it in your account"
          );
        }
        break;
      case 'ambiguous':
        counts.ambiguous++;
        console.warn(
          `[facebookMarketplaceEmailPollService] AMBIGUOUS ${label} sold email -- title matches more than one item, needs manual reconciliation`,
          { uid, organizerId: outcome.organizerId, itemTitleFromBody: outcome.title, candidateCount: outcome.candidateCount, reason: outcome.reason, previouslySeen: info.seen }
        );
        if (!info.seen && (await claimProcessed(key))) {
          await notifyOrganizerVintedReconciliationNeeded(
            label,
            outcome.organizerId,
            outcome.title,
            `its title matches ${outcome.candidateCount ?? 'more than one'} of your listings, so we couldn't tell which one actually sold`
          );
        }
        break;
      case 'bundle':
        // S-VINTED-BUNDLE-SALE (2026-10-11): Vinted bundle email (no item titles). Nothing is
        // marked sold from the email; the organizer is notified (with a link to the manual
        // selection page, 2026-10-12) and the extension's wardrobe sold-check is armed
        // (vintedBundleSaleService.ts). Counted as 'ambiguous'.
        counts.ambiguous++;
        console.warn(
          `[facebookMarketplaceEmailPollService] BUNDLE ${label} sold email -- items not named, routed to wardrobe sold-check and the manual selection page`,
          { uid, organizerId: outcome.organizerId, itemCount: outcome.itemCount, amountText: outcome.amountText, conversationId: outcome.conversationId }
        );
        if (await claimProcessed(key)) {
          await notifyOrganizerVintedBundleSale(outcome.organizerId, {
            itemCount: outcome.itemCount,
            amountText: outcome.amountText,
            buyer: outcome.buyer,
            conversationId: outcome.conversationId ?? null,
          });
        }
        break;
      case 'ignored':
        counts.ignored++;
        console.log(`[facebookMarketplaceEmailPollService] IGNORED ${label} UID ${uid}: ${outcome.reason}`);
        break;
    }

    await claimProcessed(key); // no-op when a notifying branch above already claimed it
    if (!info.seen) await markSeen(client, uid);
  }
}

/** Vinted branch: every not-yet-processed email from no-reply@vinted.com in the recent window (read or unread). */
export async function processVintedBatch(client: ImapFlow, result: FacebookSoldEmailPollResult): Promise<void> {
  await processTitleEmailBatch(client, result, 'Vinted', VINTED_SOLD_EMAIL_SEARCH_QUERY, result.vinted, (email) =>
    processVintedSoldEmail(email),
  );
}

/** Gmail search for the retroactive pass: a wider window than the normal 3 days, Vinted mail only. */
const VINTED_RETRO_SEARCH_QUERY = '(from:no-reply@vinted.com) newer_than:7d -in:spam -in:trash';
const VINTED_RETRO_MAX_UIDS = 200;
const VINTED_RETRO_BACKOFF_MS = 3 * 60 * 60 * 1000;
/** Token-match retry: e-mails re-evaluated per poll (the rest wait for the next 20-minute run). */
const VINTED_RETRY_MAX_PER_RUN = 40;

/** Deterministic backoff marker so an unmatched notice is not re-scanned on every 20-minute poll. Exported for tests. */
export function vintedRetroEventKey(noticeId: string, now: number = Date.now()): string {
  return `vinted-bundle-retro:${noticeId}:${Math.floor(now / VINTED_RETRO_BACKOFF_MS)}`;
}

/** True when `notice` is the notice created for a bundle email with this item count / amount. */
function noticeMatchesBundleEmail(notice: BundleNoticeRow, info: { itemCount: number; amountText: string | null }): boolean {
  const meta = parseBundleNoticeLink(notice.link, notice.body);
  if (meta.itemCount !== info.itemCount) return false;
  if (info.amountText && meta.amountText && meta.amountText !== info.amountText) return false;
  return true;
}

/**
 * RETROACTIVE conversation-id attach (2026-10-12). Bundle sales already processed before conversation ids were
 * extracted (marker "sold-email:Vinted:<Message-ID>" exists, so processVintedBatch never looks at them again) have
 * an open notice with no Vinted conversation id, which the extension needs to reconcile them automatically. While
 * such notices exist this pass re-reads the last 7 days of Vinted mail READ-ONLY (inspectVintedBundleEmail: same
 * sender / DKIM / organizer-token guards, nothing sold, no markers, no \Seen flags), and attaches the decoded
 * conversation id to the matching open notice. Idempotent: a notice that has an id, or an id already used by
 * another notice, is never touched, and no notice is ever created here. Never throws.
 */
export async function reattachVintedBundleConversations(client: ImapFlow, result: FacebookSoldEmailPollResult): Promise<number> {
  let attached = 0;
  try {
    const now = Date.now();
    let orphans = await listBundleNoticesMissingConversation(now);
    if (orphans.length === 0) return 0;
    // Backoff: notices already scanned in the current 3-hour bucket are skipped.
    const keys = orphans.map((o) => vintedRetroEventKey(o.id, now));
    const done = await loadProcessedKeys(keys);
    orphans = orphans.filter((o) => !done.has(vintedRetroEventKey(o.id, now)));
    if (orphans.length === 0) return 0;

    const found = await searchUnread(client, VINTED_RETRO_SEARCH_QUERY, 'VintedRetro', result);
    const uids = (found ?? []).slice(-VINTED_RETRO_MAX_UIDS);
    const organizerUserCache = new Map<string, string | null>();
    let remaining = orphans.slice();
    for (const uid of uids) {
      if (remaining.length === 0) break;
      try {
        const msg: any = await client.fetchOne(uid, { source: true }, { uid: true });
        if (!msg || !msg.source) continue;
        const email = await parseImapMessageToInboundEmail(msg.source as Buffer);
        const info = await inspectVintedBundleEmail(email);
        if (!info || !info.conversationId) continue;
        if (!organizerUserCache.has(info.organizerId)) {
          const org = await prisma.organizer.findUnique({ where: { id: info.organizerId }, select: { userId: true } });
          organizerUserCache.set(info.organizerId, org?.userId ?? null);
        }
        const userId = organizerUserCache.get(info.organizerId);
        if (!userId) continue;
        const target = remaining.find((n) => n.userId === userId && noticeMatchesBundleEmail(n, info));
        if (!target) continue;
        const ok = await attachConversationToNotice(target, {
          conversationId: info.conversationId,
          itemCount: info.itemCount,
          amountText: info.amountText,
        });
        remaining = remaining.filter((n) => n.id !== target.id);
        if (ok) {
          attached++;
          console.log(`[facebookMarketplaceEmailPollService] VintedRetro: attached conversation ${info.conversationId} to bundle notice ${target.id}`);
        }
      } catch (err: any) {
        console.warn(`[facebookMarketplaceEmailPollService] VintedRetro UID ${uid} skipped:`, err?.message || err);
      }
    }
    // Whatever is left unmatched is not re-scanned for a few hours.
    for (const n of remaining) await claimProcessed(vintedRetroEventKey(n.id, now));
  } catch (err: any) {
    result.errors.push(`VintedRetro: ${err?.message || err}`);
    console.error('[facebookMarketplaceEmailPollService] VintedRetro pass failed:', err?.message || err);
  }
  return attached;
}

/** Backoff marker for the token-match retry pass: an e-mail that still has no safe match is not re-evaluated for a few hours. Exported for tests. */
export function vintedSoldRetryKey(emailKey: string, now: number = Date.now()): string {
  return `${emailKey}:retry:${Math.floor(now / VINTED_RETRO_BACKOFF_MS)}`;
}

/** Permanent marker: this e-mail went through the token-match retry and reached a final outcome. Exported for tests. */
export function vintedSoldRetryDoneKey(emailKey: string): string {
  return `${emailKey}:retry:done`;
}

/**
 * TOKEN-MATCH RETRY of already-processed Vinted sold e-mails (2026-10-12, Nickel Coin Tube). processVintedBatch marks every
 * handled e-mail processed, including an 'unmatched' one, so a sold e-mail whose title could not be matched when it arrived
 * (here: re-worded versus the stored title, before the token-overlap matcher shipped) was never looked at again and the
 * Vinted listing row stayed POSTED after the sale. This pass re-reads the last 7 days of Vinted mail and replays an already
 * processed e-mail ONLY through processVintedSoldTitleReportTokenMatchOnly: it sells something only when the title resolves
 * to exactly one item with a live Vinted listing by token overlap (never an exact-title hit, which an earlier pass already
 * handled and which could belong to an item that is back on sale). The usual replay guards still apply (the e-mail context
 * runs through runWithSoldEmailSource: an e-mail older than the live listing, or one that already consumed a unit, is ignored).
 * Idempotent through markers (no schema change): ":retry:done" once matched / final, a 3-hour bucket marker while still
 * unmatched. Never notifies, never marks anything \Seen, never throws. Returns how many items it sold.
 */
export async function retryTokenMatchVintedSoldEmails(client: ImapFlow, result: FacebookSoldEmailPollResult): Promise<number> {
  let sold = 0;
  try {
    const found = await searchUnread(client, VINTED_RETRO_SEARCH_QUERY, 'VintedRetry', result);
    const uids = (found ?? []).slice(-VINTED_RETRO_MAX_UIDS);
    if (uids.length === 0) return 0;
    const infos = await fetchWindowMessageInfo(client, uids, 'VintedRetry', result);
    if (!infos || infos.length === 0) return 0;
    const now = Date.now();
    const markers = await loadProcessedKeys(
      infos.flatMap((i) => {
        const k = soldEmailEventKey('Vinted', i);
        return [k, vintedSoldRetryDoneKey(k), vintedSoldRetryKey(k, now)];
      }),
    );
    // Only e-mails the normal pass already handled (marker present); a brand-new one belongs to processVintedBatch.
    const candidates = infos.filter((i) => {
      const k = soldEmailEventKey('Vinted', i);
      return markers.has(k) && !markers.has(vintedSoldRetryDoneKey(k)) && !markers.has(vintedSoldRetryKey(k, now));
    });
    for (const info of candidates.slice(0, VINTED_RETRY_MAX_PER_RUN)) {
      const key = soldEmailEventKey('Vinted', info);
      try {
        const msg: any = await client.fetchOne(info.uid, { source: true }, { uid: true });
        if (!msg || !msg.source) continue;
        const email = await parseImapMessageToInboundEmail(msg.source as Buffer);
        const outcome = await runWithSoldEmailSource({ key, sentAt: info.sentAt ?? null }, () =>
          processVintedSoldEmail(email, {
            processTitleReport: (organizerId: string, title: string) => processVintedSoldTitleReportTokenMatchOnly(organizerId, title),
          }),
        );
        if (outcome.kind === 'matched') {
          if (!outcome.alreadySold) {
            sold++;
            console.log(`[facebookMarketplaceEmailPollService] VintedRetry: token-matched an unmatched sold e-mail to item ${outcome.itemId} (result=${outcome.result})`);
          }
          await claimProcessed(vintedSoldRetryDoneKey(key));
        } else if (outcome.kind === 'unmatched' || outcome.kind === 'ambiguous') {
          await claimProcessed(vintedSoldRetryKey(key, now)); // still no safe match: look again in a few hours
        } else {
          await claimProcessed(vintedSoldRetryDoneKey(key)); // ignored / bundle: nothing a title retry can do
        }
      } catch (err: any) {
        // A failed commit leaves no marker, so the next poll retries it.
        console.warn(`[facebookMarketplaceEmailPollService] VintedRetry UID ${info.uid} skipped:`, err?.message || err);
      }
    }
  } catch (err: any) {
    result.errors.push(`VintedRetry: ${err?.message || err}`);
    console.error('[facebookMarketplaceEmailPollService] VintedRetry pass failed:', err?.message || err);
  }
  return sold;
}

/** Mercari branch (2026-09-23): every not-yet-processed "You've made a sale: ..." email. */
export async function processMercariBatch(client: ImapFlow, result: FacebookSoldEmailPollResult): Promise<void> {
  await processTitleEmailBatch(client, result, 'Mercari', MERCARI_SOLD_EMAIL_SEARCH_QUERY, result.mercari, (email) =>
    processMercariSoldEmail(email),
  );
}

/** Poshmark branch (2026-09-23; first live email 2026-10-28): every not-yet-processed '... just sold to ...' email. */
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
    await reattachVintedBundleConversations(client, result);
    await retryTokenMatchVintedSoldEmails(client, result);
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
