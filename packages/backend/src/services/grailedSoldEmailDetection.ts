/**
 * grailedSoldEmailDetection.ts -- Grailed branch of the ADR-131 inbound sold-email pipeline
 * (2026-09-23).
 *
 * STATUS: PROVISIONAL. The sale email's subject and layout are NOT known. Only Grailed's in-app
 * GrailedBot wording has been seen:
 *   "SALE CONFIRMED ... You just sold <title> in Size <size> for $<price>"
 *   "Item Sold: <title> in Size S for $385"
 * So this branch is deliberately narrow: it only commits when the body carries that exact
 * sentence shape, and otherwise logs a 'grailed_unparsed' warn with the subject and a 300-char
 * body excerpt so the first real email tells us the format. Tighten the subject gate and body
 * regex once a real one is in hand.
 *
 * GUARDS (fail closed, same order as the Mercari/Poshmark branches):
 *   1. Exact sender help@grailed.com (case-insensitive). news@mail.grailed.com (promos such as
 *      "Final Hours: Grail Sale") is ignored completely.
 *   1a. Subject gate: /\b(sold|sale)\b/i and NOT /offer|incomplete|verify|listing/i.
 *   1b. Topmost mx.google.com Authentication-Results: dkim=pass for grailed.com (subdomains ok)
 *       and dmarc=pass (GRAILED_DKIM_DOMAINS). A Mailgun signature alone never passes.
 *   1c. Organizer from the sold-<token> recipient; none or more than one organizer -> 'ignored'.
 *   2. Title from the body: (?:Item Sold:|You just sold) <title> in Size <size> ... for $<price>.
 *      No title -> 'unmatched' (reason 'grailed_unparsed'), nothing committed.
 *   3. processPlatformSoldReport('GRAILED', 'GRAILED', ...): exact normalized title, unique,
 *      8+ chars, never fuzzy. 'error' throws so the poller leaves the message unread for retry.
 */

import {
  resolveOrganizerIdByForwardingToken,
  extractForwardingTokenFromAddress,
} from './organizerEmailForwardingService';
import { verifyInboundEmailAuthentication, GRAILED_DKIM_DOMAINS } from './inboundEmailAuthService';
import { htmlToPlainText } from './vintedSoldEmailDetection';
import { processPlatformSoldReport, type PlatformSoldResult } from './platformSoldDetectionService';

export const GRAILED_SOLD_EMAIL_SENDER = 'help@grailed.com';
export const SOLD_VIA_GRAILED = 'GRAILED';
const MAX_TITLE_LEN = 500;
const UNPARSED_EXCERPT_LEN = 300;

export interface InboundGrailedSoldEmail {
  from: string;
  subject: string;
  links?: string[];
  rawBody?: string;
  authenticationResults?: string[];
  arcAuthenticationResults?: string[];
  recipientAddresses?: string[];
}

export type GrailedSoldEmailResult =
  | { kind: 'ignored'; reason: string }
  | {
      kind: 'matched';
      organizerId: string;
      itemId: string;
      title: string;
      soldVia: typeof SOLD_VIA_GRAILED;
      alreadySold: boolean;
      result: PlatformSoldResult['result'];
    }
  | { kind: 'ambiguous'; organizerId: string; title: string; candidateCount: number | null; reason: string }
  | { kind: 'unmatched'; organizerId: string; title: string | null; reason: string };

export interface GrailedSoldEmailDeps {
  resolveOrganizerIdByToken?: (token: string) => Promise<string | null>;
  processReport?: (organizerId: string, title: string) => Promise<PlatformSoldResult>;
}

const SUBJECT_ALLOW_RE = /\b(sold|sale)\b/i;
const SUBJECT_DENY_RE = /offer|incomplete|verify|listing/i;

/** True when the subject could be a sale notice (provisional gate). */
export function isGrailedSaleSubject(subject: string | null | undefined): boolean {
  const s = String(subject ?? '').trim();
  return SUBJECT_ALLOW_RE.test(s) && !SUBJECT_DENY_RE.test(s);
}

const BODY_TITLE_RE = /(?:Item Sold:|You just sold)\s+(.+?)\s+in [Ss]ize\s+\S+.*?\bfor\s+\$[\d,.]+/;

/** Title from the GrailedBot-style sentence, or null (fail closed). */
export function parseGrailedSoldEmailTitle(body: string | null | undefined): string | null {
  if (!body) return null;
  const m = BODY_TITLE_RE.exec(htmlToPlainText(body));
  if (!m) return null;
  const title = m[1].trim();
  return title ? title.slice(0, MAX_TITLE_LEN) : null;
}

function isExactSender(from: string): boolean {
  return String(from ?? '').trim().toLowerCase() === GRAILED_SOLD_EMAIL_SENDER;
}

export async function processGrailedSoldEmail(
  email: InboundGrailedSoldEmail,
  deps: GrailedSoldEmailDeps = {},
): Promise<GrailedSoldEmailResult> {
  const resolveOrganizerIdByToken = deps.resolveOrganizerIdByToken ?? resolveOrganizerIdByForwardingToken;
  const processReport =
    deps.processReport ??
    ((orgId: string, title: string) =>
      processPlatformSoldReport('GRAILED', SOLD_VIA_GRAILED, orgId, { remoteListingId: '', title }));

  if (!isExactSender(email.from)) {
    return { kind: 'ignored', reason: `sender "${email.from}" is not ${GRAILED_SOLD_EMAIL_SENDER}` };
  }
  if (!isGrailedSaleSubject(email.subject)) {
    return { kind: 'ignored', reason: 'subject does not look like a Grailed sale notice' };
  }

  const auth = verifyInboundEmailAuthentication(email, GRAILED_DKIM_DOMAINS);
  if (!auth.ok) {
    console.warn('[GrailedSoldEmailDetection] rejecting sold email -- sender authentication failed', { reason: auth.reason });
    return { kind: 'ignored', reason: `sender authentication failed: ${auth.reason}` };
  }

  const tokens = new Map<string, string>();
  for (const addr of email.recipientAddresses ?? []) {
    const token = extractForwardingTokenFromAddress(addr);
    if (token && !tokens.has(token.toLowerCase())) tokens.set(token.toLowerCase(), token);
  }
  if (tokens.size === 0) {
    console.warn('[GrailedSoldEmailDetection] rejecting sold email -- no sold-<token> recipient address', {
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
    console.warn(`[GrailedSoldEmailDetection] rejecting sold email -- ${reason}`, { tokenCount: tokens.size });
    return { kind: 'ignored', reason };
  }
  const organizerId = [...organizerIds][0];

  const title = parseGrailedSoldEmailTitle(email.rawBody);
  if (!title) {
    console.warn('[GrailedSoldEmailDetection] grailed_unparsed -- sale-like Grailed email with no parsable title, nothing committed', {
      organizerId,
      subject: email.subject,
      bodyExcerpt: htmlToPlainText(email.rawBody ?? '').slice(0, UNPARSED_EXCERPT_LEN),
    });
    return { kind: 'unmatched', organizerId, title: null, reason: 'grailed_unparsed' };
  }

  const r = await processReport(organizerId, title);
  switch (r.result) {
    case 'sold':
    case 'alreadySold':
    case 'notAvailable':
      return {
        kind: 'matched',
        organizerId,
        itemId: r.itemId as string,
        title,
        soldVia: SOLD_VIA_GRAILED,
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
      throw new Error(`Grailed sold commit failed for organizer ${organizerId}: ${r.reason ?? r.result}`);
  }
}
