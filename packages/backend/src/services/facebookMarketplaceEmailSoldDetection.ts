/**
 * facebookMarketplaceEmailSoldDetection.ts — vendor-agnostic core of ADR-131
 * (Facebook Marketplace sold detection via order-confirmation email).
 *
 * WHAT THIS IS: a pure-ish parsing + matching function that takes an already-received,
 * already-parsed email (from address, subject, and its links/body) and decides whether
 * it is a genuine Facebook Marketplace "order placed" email, and if so, which Item it
 * corresponds to. It deliberately knows NOTHING about how the email got here -- no IMAP,
 * no SendGrid Inbound Parse / Mailgun Routes / Postmark Inbound payload shape, no
 * organizer-forwarding-token lookup (see organizerEmailForwardingService.ts for that
 * separate concern). Patrick has not yet picked an inbound-mail vendor; whichever one is
 * chosen, that vendor's webhook adapter is future follow-up work whose only job is to
 * translate that vendor's payload into the InboundFacebookOrderEmail shape below and call
 * processFacebookMarketplaceOrderEmail with it. Nothing here should need to change when
 * that vendor is picked.
 *
 * INPUT CONTRACT (InboundFacebookOrderEmail):
 *   - from: the email's From header, EXACTLY as delivered. Compared for an exact match
 *     against 'noreply@marketplace.facebook.com' (case-insensitive on the whole address,
 *     since mail headers are commonly re-cased in transit) -- never fuzzy-matched.
 *   - subject: the email's Subject header, exactly as delivered. Must START WITH
 *     'New Marketplace order for' (case-sensitive -- this is Facebook's own fixed
 *     string). Sibling emails from the same sender exist for other events (offers,
 *     shipping labels, delivery) with different subject prefixes and must NOT match.
 *   - links: every anchor href found in the email body, in whatever order the caller's
 *     parser produced them. PREFERRED input when the caller already has these (e.g. an
 *     inbound-parse vendor that hands back a structured link list, or a caller that ran
 *     its own HTML parse). listing_id is extracted from these hrefs, never from any
 *     rendered/visible link text.
 *   - rawBody: fallback/alternative to `links` -- the raw email body (HTML preferred,
 *     plain text also works since extraction is a plain regex over whatever text is
 *     given). At least one of `links` or `rawBody` must be provided for a real match to
 *     be possible; if both are omitted the email is treated as unmatched (fail closed),
 *     never rejected outright, since sender+subject may still have been genuine.
 *
 * MATCHING LOGIC (ADR-131 §3):
 *   1. Reject (kind: 'ignored') anything whose sender or subject doesn't match exactly.
 *   2. Extract the `listing_id` query parameter via `listing_id=(\d+)` against the raw
 *      href/body text -- this is Facebook's own Marketplace listing id. Also best-effort
 *      extract the path-segment order id (`/shipping_orders/(\d+)/`) purely for the
 *      unmatched-reconciliation log/result -- it is NOT used for matching (it is a
 *      different id than listing_id; conflating the two was flagged explicitly in the
 *      ADR as a mistake to avoid).
 *   3. Resolve listing_id -> itemId via the latest MarketplaceListingJob row where
 *      remoteListingId equals it, platform='FACEBOOK', action='POST', ordered by
 *      createdAt desc (mirrors the existing "first-seen-wins under desc order" idiom
 *      extensionController.ts already uses twice for the identical reason).
 *   4. FAIL CLOSED on no match: never fall back to fuzzy title-matching. Return
 *      (kind: 'unmatched') carrying the raw order id and the item title parsed from the
 *      subject line, and log a structured event with the same detail, for a human to
 *      reconcile later. This function does not send any notification itself -- wiring an
 *      actual alert/digest to Patrick is separate follow-up work (ADR-131 §3/§6).
 *   5. On a real match, call commitSale (defaults to commitFacebookNativeSale) with
 *      soldVia='FB_EMAIL_ORDER' and return (kind: 'matched').
 *
 * TESTABILITY: the two side-effecting steps (resolving an itemId from the database, and
 * committing the sale) are injectable via the `deps` parameter, defaulting to the real
 * Prisma-backed / commitFacebookNativeSale-backed implementations. This keeps the
 * parsing/matching logic (sender/subject/regex extraction, the fail-closed branch) fully
 * testable with zero database or side effects, per ADR-131's "pure, testable function"
 * instruction -- see the accompanying __tests__ file for exactly that.
 */

import { prisma } from '../lib/prisma';
import { commitFacebookNativeSale } from './facebookNativeSaleService';

export const FACEBOOK_ORDER_EMAIL_SENDER = 'noreply@marketplace.facebook.com';
export const FACEBOOK_ORDER_EMAIL_SUBJECT_PREFIX = 'New Marketplace order for';

/** The new Item.lastSoldVia tag for this detection channel (ADR-131 §4). Plain string
 * value on the existing free-form column -- no enum, no migration. */
export const SOLD_VIA_FB_EMAIL_ORDER = 'FB_EMAIL_ORDER';

export interface InboundFacebookOrderEmail {
  /** The email's From header, exactly as delivered. */
  from: string;
  /** The email's Subject header, exactly as delivered. */
  subject: string;
  /** Every anchor href found in the body, if the caller already extracted them. */
  links?: string[];
  /** Raw email body (HTML or plain text), used if `links` is not provided or doesn't
   * contain a match. */
  rawBody?: string;
}

export type FacebookOrderEmailResult =
  | {
      kind: 'ignored';
      /** Why this email was not even considered an order-placed email (wrong sender,
       * wrong subject prefix). Not an error -- most emails from this sender ARE one of
       * these siblings and should be ignored silently by a real caller. */
      reason: string;
    }
  | {
      kind: 'matched';
      itemId: string;
      remoteListingId: string;
      remoteOrderId: string | null;
      soldVia: typeof SOLD_VIA_FB_EMAIL_ORDER;
      alreadyCommitted: boolean;
    }
  | {
      kind: 'unmatched';
      /** Facebook's shipping-order id parsed from the link path segment, if found.
       * Null when even that couldn't be parsed (e.g. no links/rawBody supplied at all). */
      remoteOrderId: string | null;
      /** listing_id parsed from the link, if found. Null means listing_id itself
       * couldn't be extracted (a different failure mode than "extracted but no job
       * row matched it") -- both fail closed the same way, but the log/result
       * distinguishes them for whoever reconciles this. */
      remoteListingId: string | null;
      /** Item title parsed from the subject line ("New Marketplace order for X" -> X),
       * for a human to search FindA.Sale by title when reconciling. Null only if the
       * subject didn't actually match the prefix, which can't happen on this branch. */
      itemTitleFromSubject: string | null;
      reason: string;
    };

export interface FacebookOrderEmailDeps {
  /** Resolves a Facebook listing id to the FindA.Sale itemId it belongs to, or null if
   * no matching job row exists. Defaults to the real MarketplaceListingJob query
   * (ADR-131 §3). Override in tests to avoid touching Prisma. */
  resolveItemIdForListingId?: (remoteListingId: string) => Promise<string | null>;
  /** Commits the sale once a match is found. Defaults to commitFacebookNativeSale.
   * Override in tests to assert on calls without touching the database. */
  commitSale?: (itemId: string, soldVia: string) => Promise<{ alreadyCommitted: boolean }>;
}

async function defaultResolveItemIdForListingId(remoteListingId: string): Promise<string | null> {
  const job = await prisma.marketplaceListingJob.findFirst({
    where: { remoteListingId, platform: 'FACEBOOK', action: 'POST' },
    orderBy: { createdAt: 'desc' },
    select: { itemId: true },
  });
  return job?.itemId ?? null;
}

async function defaultCommitSale(itemId: string, soldVia: string): Promise<{ alreadyCommitted: boolean }> {
  const result = await commitFacebookNativeSale(itemId, soldVia);
  return { alreadyCommitted: result.alreadyCommitted };
}

// listing_id is the query-string parameter on the order-placed link -- e.g.
// "/marketplace/you/shipping_orders/10175351837195594/?referral_surface=
// c2c_seller_order_placed_email&listing_id=1473556531485754". Deliberately matched
// against the raw href/body text (not visible link text, which won't reliably carry the
// query string at all).
const LISTING_ID_PATTERN = /listing_id=(\d+)/;
// The path-segment id in the SAME link is the shipping/order id, NOT the listing id --
// captured only for the unmatched-reconciliation log, never used to resolve an item.
const ORDER_ID_PATTERN = /shipping_orders\/(\d+)/;

function extractFirstMatch(pattern: RegExp, texts: string[]): string | null {
  for (const text of texts) {
    if (!text) continue;
    const match = pattern.exec(text);
    if (match) return match[1];
  }
  return null;
}

function parseItemTitleFromSubject(subject: string): string | null {
  if (!subject.startsWith(FACEBOOK_ORDER_EMAIL_SUBJECT_PREFIX)) return null;
  const title = subject.slice(FACEBOOK_ORDER_EMAIL_SUBJECT_PREFIX.length).trim();
  return title.length > 0 ? title : null;
}

function isExactSender(from: string): boolean {
  return from.trim().toLowerCase() === FACEBOOK_ORDER_EMAIL_SENDER;
}

/**
 * Parses and matches one inbound email against Facebook's Marketplace order-placed
 * signature, and on a real match, commits the sale. See file header for the full
 * contract. Never throws for a malformed/unrelated email -- those resolve to
 * `{ kind: 'ignored' | 'unmatched' }`. Only a genuine downstream failure (e.g.
 * commitSale rejecting for a reason other than "already committed") propagates.
 */
export async function processFacebookMarketplaceOrderEmail(
  email: InboundFacebookOrderEmail,
  deps: FacebookOrderEmailDeps = {},
): Promise<FacebookOrderEmailResult> {
  const resolveItemIdForListingId = deps.resolveItemIdForListingId ?? defaultResolveItemIdForListingId;
  const commitSale = deps.commitSale ?? defaultCommitSale;

  if (!isExactSender(email.from)) {
    return { kind: 'ignored', reason: `sender "${email.from}" is not ${FACEBOOK_ORDER_EMAIL_SENDER}` };
  }
  if (!email.subject.startsWith(FACEBOOK_ORDER_EMAIL_SUBJECT_PREFIX)) {
    return { kind: 'ignored', reason: `subject does not start with "${FACEBOOK_ORDER_EMAIL_SUBJECT_PREFIX}"` };
  }

  const itemTitleFromSubject = parseItemTitleFromSubject(email.subject);
  const searchTexts = [...(email.links ?? []), ...(email.rawBody ? [email.rawBody] : [])];

  const remoteListingId = extractFirstMatch(LISTING_ID_PATTERN, searchTexts);
  const remoteOrderId = extractFirstMatch(ORDER_ID_PATTERN, searchTexts);

  if (!remoteListingId) {
    console.warn('[FacebookMarketplaceEmailSoldDetection] unmatched order email -- no listing_id extracted', {
      remoteOrderId,
      itemTitleFromSubject,
    });
    return {
      kind: 'unmatched',
      remoteOrderId,
      remoteListingId: null,
      itemTitleFromSubject,
      reason: 'no listing_id found in any provided link/rawBody',
    };
  }

  const itemId = await resolveItemIdForListingId(remoteListingId);

  if (!itemId) {
    // FAIL CLOSED (ADR-131 §3, non-negotiable): never fall back to fuzzy title-matching.
    // A human reconciles this from the logged detail.
    console.warn('[FacebookMarketplaceEmailSoldDetection] unmatched order email -- no MarketplaceListingJob row', {
      remoteListingId,
      remoteOrderId,
      itemTitleFromSubject,
    });
    return {
      kind: 'unmatched',
      remoteOrderId,
      remoteListingId,
      itemTitleFromSubject,
      reason: `no MarketplaceListingJob row (platform=FACEBOOK, action=POST) found for remoteListingId=${remoteListingId}`,
    };
  }

  const { alreadyCommitted } = await commitSale(itemId, SOLD_VIA_FB_EMAIL_ORDER);

  return {
    kind: 'matched',
    itemId,
    remoteListingId,
    remoteOrderId,
    soldVia: SOLD_VIA_FB_EMAIL_ORDER,
    alreadyCommitted,
  };
}
