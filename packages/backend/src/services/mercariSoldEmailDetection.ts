/**
 * mercariSoldEmailDetection.ts -- Mercari branch of the ADR-131 inbound sold-email pipeline
 * (2026-09-23). Sibling of vintedSoldEmailDetection.ts, same guards in the same order.
 *
 * REAL EMAIL (observed in the organizer's inbox, 2026-09-02):
 *   From:    Mercari <no-reply@alerts.us.mercari.com>
 *   Subject: You've made a sale: Planet Waves XLR Microphone Cable, Male to Female
 *   Auth:    dkim=pass header.i=@alerts.us.mercari.com, dkim=pass header.i=@sendgrid.info,
 *            dmarc=pass (p=REJECT) header.from=mercari.com
 *   Body:    "Congratulations! You made a sale." ... "Item details <title> ID: m55401730709"
 *            ... "Price Selling fee $17.00 -$2.37 Earnings $14.63" ...
 * The same sender also sends "Transaction canceled: <title>", "The buyer has asked to cancel
 * <title>.", account notices ("You've updated your payment method."), and ID Check notices; chat
 * messages, view/like counts and promos come from no-reply@hello.us.mercari.com. None of those
 * can mark anything sold: the sender AND the subject prefix must both match exactly.
 *
 * GUARDS (fail closed, same as the Vinted/Facebook branches):
 *   1. Exact sender no-reply@alerts.us.mercari.com and subject "You've made a sale: <title>"
 *      (straight or curly apostrophe). Anything else -> 'ignored'.
 *   1a. Topmost mx.google.com Authentication-Results: dkim=pass for mercari.com (subdomains ok)
 *       and dmarc=pass (MERCARI_DKIM_DOMAINS). The sendgrid.info signature is never enough.
 *   1b. Organizer from the sold-<token> recipient; none or more than one organizer -> 'ignored'.
 *   2. Title: the body's "Item details <title> ID: m<digits>" block (full title, plus Mercari's
 *      own item id); the subject title is the fallback. No title -> 'unmatched'.
 *   3. processPlatformSoldReport('MERCARI', 'MERCARI', ...): Mercari id first (only if a MERCARI
 *      job row recorded it), else unique normalized title (8+ chars), never fuzzy. The item's
 *      MERCARI listing record is closed, then the sale is committed (SOLD, lastSoldVia 'MERCARI',
 *      eBay/Shopify/Discogs withdrawal); the extension pulls the other platforms. 'error' throws
 *      so the poller leaves the message unread for retry.
 *
 * KNOWN LIMIT: a Mercari buyer can cancel after the sale email (seen live: same item, "Transaction
 * canceled" four hours later). This branch never un-sells; the organizer relists by hand.
 */

import {
  resolveOrganizerIdByForwardingToken,
  extractForwardingTokenFromAddress,
} from './organizerEmailForwardingService';
import { verifyInboundEmailAuthentication, MERCARI_DKIM_DOMAINS } from './inboundEmailAuthService';
import { htmlToPlainText } from './vintedSoldEmailDetection';
import { processPlatformSoldReport, type PlatformSoldResult } from './platformSoldDetectionService';

export const MERCARI_SOLD_EMAIL_SENDER = 'no-reply@alerts.us.mercari.com';
export const MERCARI_SOLD_EMAIL_SUBJECT_PREFIX = "You've made a sale:";
export const SOLD_VIA_MERCARI = 'MERCARI';
const MAX_TITLE_LEN = 500;

export interface InboundMercariSoldEmail {
  from: string;
  subject: string;
  links?: string[];
  rawBody?: string;
  authenticationResults?: string[];
  arcAuthenticationResults?: string[];
  recipientAddresses?: string[];
}

export type MercariSoldEmailResult =
  | { kind: 'ignored'; reason: string }
  | {
      kind: 'matched';
      organizerId: string;
      itemId: string;
      title: string;
      mercariItemId: string | null;
      soldVia: typeof SOLD_VIA_MERCARI;
      alreadySold: boolean;
      result: PlatformSoldResult['result'];
    }
  | { kind: 'ambiguous'; organizerId: string; title: string; candidateCount: number | null; reason: string }
  | { kind: 'unmatched'; organizerId: string; title: string | null; reason: string };

export interface MercariSoldEmailDeps {
  resolveOrganizerIdByToken?: (token: string) => Promise<string | null>;
  processReport?: (organizerId: string, title: string, mercariItemId: string | null) => Promise<PlatformSoldResult>;
}

// "You've made a sale: <title>" -- Mercari uses a straight apostrophe here today; a curly one is
// accepted too (its chat subjects use "You’ve"). Nothing else before or after.
const SUBJECT_RE = /^You['’]ve made a sale: (.+)$/;

/** Title from the subject, or null when the subject is not the sale subject. */
export function parseMercariSubjectTitle(subject: string | null | undefined): string | null {
  const m = SUBJECT_RE.exec(String(subject ?? '').trim());
  if (!m) return null;
  const t = m[1].trim();
  return t ? t.slice(0, MAX_TITLE_LEN) : null;
}

const ITEM_DETAILS_RE = /\bItem details (.+?) ID: (m\d{6,20})\b/;

/** { title, mercariItemId } from the body's "Item details" block, or null (fail closed). */
export function parseMercariSoldEmailBody(body: string | null | undefined): { title: string; mercariItemId: string } | null {
  if (!body) return null;
  const text = htmlToPlainText(body);
  const m = ITEM_DETAILS_RE.exec(text);
  if (!m) return null;
  const title = m[1].trim();
  if (!title) return null;
  return { title: title.slice(0, MAX_TITLE_LEN), mercariItemId: m[2] };
}

function isExactSender(from: string): boolean {
  return String(from ?? '').trim().toLowerCase() === MERCARI_SOLD_EMAIL_SENDER;
}

export async function processMercariSoldEmail(
  email: InboundMercariSoldEmail,
  deps: MercariSoldEmailDeps = {},
): Promise<MercariSoldEmailResult> {
  const resolveOrganizerIdByToken = deps.resolveOrganizerIdByToken ?? resolveOrganizerIdByForwardingToken;
  const processReport =
    deps.processReport ??
    ((orgId: string, title: string, mercariItemId: string | null) =>
      processPlatformSoldReport('MERCARI', SOLD_VIA_MERCARI, orgId, { remoteListingId: mercariItemId ?? '', title }));

  if (!isExactSender(email.from)) {
    return { kind: 'ignored', reason: `sender "${email.from}" is not ${MERCARI_SOLD_EMAIL_SENDER}` };
  }
  const subjectTitle = parseMercariSubjectTitle(email.subject);
  if (!subjectTitle) {
    return { kind: 'ignored', reason: `subject does not start with "${MERCARI_SOLD_EMAIL_SUBJECT_PREFIX}"` };
  }

  const auth = verifyInboundEmailAuthentication(email, MERCARI_DKIM_DOMAINS);
  if (!auth.ok) {
    console.warn('[MercariSoldEmailDetection] rejecting sold email -- sender authentication failed', { reason: auth.reason });
    return { kind: 'ignored', reason: `sender authentication failed: ${auth.reason}` };
  }

  const tokens = new Map<string, string>();
  for (const addr of email.recipientAddresses ?? []) {
    const token = extractForwardingTokenFromAddress(addr);
    if (token && !tokens.has(token.toLowerCase())) tokens.set(token.toLowerCase(), token);
  }
  if (tokens.size === 0) {
    console.warn('[MercariSoldEmailDetection] rejecting sold email -- no sold-<token> recipient address', {
      recipientAddresses: email.recipientAddresses ?? [],
    });
    return { kind: 'ignored', reason: 'no sold-<token>@<forwarding domain> recipient address found' };
  }
  const organizerIds = new Set<string>();
  for (const token of tokens.values()) {
    const id = await resolveOrganizerIdByToken(token);
    if (id) organizerIds.add(id);
  }
  if (organizerIds.size !== 1) {
    const reason =
      organizerIds.size === 0
        ? 'forwarding token did not resolve to any known organizer'
        : 'recipient tokens resolved to more than one organizer (ambiguous)';
    console.warn(`[MercariSoldEmailDetection] rejecting sold email -- ${reason}`, { tokenCount: tokens.size });
    return { kind: 'ignored', reason };
  }
  const organizerId = [...organizerIds][0];

  const fromBody = parseMercariSoldEmailBody(email.rawBody);
  const title = fromBody?.title ?? subjectTitle;
  const mercariItemId = fromBody?.mercariItemId ?? null;

  const r = await processReport(organizerId, title, mercariItemId);
  switch (r.result) {
    case 'sold':
    case 'alreadySold':
    case 'notAvailable':
      return {
        kind: 'matched',
        organizerId,
        itemId: r.itemId as string,
        title,
        mercariItemId,
        soldVia: SOLD_VIA_MERCARI,
        alreadySold: r.result !== 'sold',
        result: r.result,
      };
    case 'ambiguous':
      return {
        kind: 'ambiguous',
        organizerId,
        title,
        candidateCount: r.candidateCount ?? null,
        reason: r.reason ?? `title matches ${r.candidateCount ?? 'several'} items`,
      };
    case 'notFound':
      return { kind: 'unmatched', organizerId, title, reason: r.reason ?? 'no_match' };
    case 'error':
    default:
      throw new Error(`Mercari sold commit failed for organizer ${organizerId}: ${r.reason ?? r.result}`);
  }
}
