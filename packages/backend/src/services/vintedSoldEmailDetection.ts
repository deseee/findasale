/**
 * vintedSoldEmailDetection.ts -- Vinted branch of the ADR-131 inbound sold-email pipeline.
 *
 * WHAT THIS IS: the Vinted sibling of facebookMarketplaceEmailSoldDetection.ts. Takes one
 * already-parsed inbound email (same shape parseImapMessageToInboundEmail produces) and, if it
 * is a genuine Vinted "You sold an item on Vinted" email forwarded to an organizer's
 * sold-<token>@<FORWARDING_DOMAIN> address, marks the matching item sold through
 * vintedSoldDetectionService.processVintedSoldTitleReport (soldVia 'VINTED'). No browser needed.
 *
 * GUARDS (same order and same fail-closed behaviour as the Facebook branch):
 *   1. Exact sender no-reply@vinted.com and exact subject "You sold an item on Vinted". Every
 *      other Vinted email (shipping label, "Order update for ...", "New offer for ...",
 *      "... was just favorited", "New message about ...", "This order is completed", payouts,
 *      marketing from team.vinted.com) is 'ignored'. Only the sold email counts.
 *   1a. Sender authentication: topmost mx.google.com Authentication-Results must show
 *      dkim=pass for vinted.com and dmarc=pass (inboundEmailAuthService, VINTED_DKIM_DOMAINS).
 *   1b. Organizer scoping from the sold-<token> recipient; none or more than one organizer
 *      -> 'ignored'.
 *   2. Title: the email has no listing id. The HTML body is reduced to text (tags stripped,
 *      entities decoded, whitespace collapsed) and the title is taken from between
 *      "<buyer> has bought " and the price token that precedes "We will transfer". The buyer
 *      name and price are untrusted and never used. No title -> 'unmatched'.
 *   3. Match + commit: processVintedSoldTitleReport (unique normalized title only, minimum
 *      length, no fuzzy matching). 'ambiguous' and 'notFound' are logged for a human; an
 *      'error' (commit failed) throws so the poller leaves the message unread for retry.
 *
 * FORWARDING: exactly like the Facebook branch, only a Gmail filter/auto-forward is supported.
 * That keeps Vinted's original From, Subject and body (and so its DKIM signature), and the
 * receiving mx.google.com stamps a fresh topmost Authentication-Results with dkim=pass
 * header.i=@vinted.com / dmarc=pass. A hand-forwarded "Fwd:" copy has the organizer as sender
 * and fails guard 1, by design (its body could say anything).
 */

import {
  resolveOrganizerIdByForwardingToken,
  extractForwardingTokenFromAddress,
} from './organizerEmailForwardingService';
import { verifyInboundEmailAuthentication, VINTED_DKIM_DOMAINS } from './inboundEmailAuthService';
import { processVintedSoldTitleReport, SOLD_VIA_VINTED, type VintedSoldEntryResult } from './vintedSoldDetectionService';

export const VINTED_SOLD_EMAIL_SENDER = 'no-reply@vinted.com';
export const VINTED_SOLD_EMAIL_SUBJECT = 'You sold an item on Vinted';
const MAX_TITLE_LEN = 500;

export interface InboundVintedSoldEmail {
  from: string;
  subject: string;
  links?: string[];
  /** Raw HTML (preferred) or plain-text body. */
  rawBody?: string;
  authenticationResults?: string[];
  arcAuthenticationResults?: string[];
  recipientAddresses?: string[];
}

export type VintedSoldEmailResult =
  | { kind: 'ignored'; reason: string }
  | { kind: 'matched'; organizerId: string; itemId: string; title: string; soldVia: typeof SOLD_VIA_VINTED; alreadySold: boolean; result: VintedSoldEntryResult['result'] }
  | { kind: 'ambiguous'; organizerId: string; title: string; candidateCount: number | null; reason: string }
  | { kind: 'unmatched'; organizerId: string; title: string | null; reason: string };

export interface VintedSoldEmailDeps {
  resolveOrganizerIdByToken?: (token: string) => Promise<string | null>;
  processTitleReport?: (organizerId: string, title: string) => Promise<VintedSoldEntryResult>;
}

// ---------------------------------------------------------------------------------------------
// Parsing (pure)
// ---------------------------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-',
  hellip: '...', lsquo: "'", rsquo: "'", ldquo: '"', rdquo: '"', euro: '€', pound: '£',
  yen: '¥', cent: '¢', copy: '©', reg: '®', trade: '™',
};

export function decodeHtmlEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, ent: string) => {
    if (ent[0] === '#') {
      const code = ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return m;
      try {
        return String.fromCodePoint(code);
      } catch {
        return m;
      }
    }
    const v = NAMED_ENTITIES[ent.toLowerCase()];
    return v === undefined ? m : v;
  });
}

/** HTML (or plain text) -> one line of visible text: drops head/style/script/comments, strips
 * tags, decodes entities, turns every whitespace run (incl. nbsp) into one space. */
export function htmlToPlainText(html: string): string {
  let s = String(html ?? '');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<(head|style|script|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  s = s.replace(/<[^>]*>/g, ' ');
  s = decodeHtmlEntities(s);
  return s.replace(/[\s ​‌‍﻿]+/g, ' ').trim();
}

// A price like "$14.00", "US$ 14", "14,00 €", "£5", "1.234,50 EUR". Only used to find where the
// title ends; its value is never read.
const PRICE = String.raw`(?:(?:US|CA|AU)?[$€£¥]\s?\d[\d.,]*|\d[\d.,]*\s?(?:[$€£¥]|zł|Kč|kr|Ft|lei|[A-Z]{3}))`;
// "<buyer> has bought <title> <price> We will transfer ...". The buyer name is a single token.
const SOLD_BODY_RE = new RegExp(String.raw`\S+ has bought (.+?) We(?: will|'ll|’ll) transfer\b`, 'i');
const TRAILING_PRICE_RE = new RegExp(String.raw`\s*${PRICE}\s*$`);

/**
 * Extracts the sold item's title from a Vinted "You sold an item" body (HTML or text).
 * Returns null when the expected sentence or a price token is not found (fail closed).
 */
export function parseVintedSoldEmailTitle(body: string | null | undefined): string | null {
  if (!body) return null;
  const text = htmlToPlainText(body);
  const m = SOLD_BODY_RE.exec(text);
  if (!m) return null;
  const segment = m[1].trim();
  const pm = TRAILING_PRICE_RE.exec(segment);
  if (!pm || pm.index === 0) return null; // no price token, or nothing before it
  const title = segment.slice(0, pm.index).trim();
  if (!title) return null;
  return title.slice(0, MAX_TITLE_LEN);
}

function isExactSender(from: string): boolean {
  return String(from ?? '').trim().toLowerCase() === VINTED_SOLD_EMAIL_SENDER;
}

function isSoldSubject(subject: string): boolean {
  return String(subject ?? '').trim() === VINTED_SOLD_EMAIL_SUBJECT;
}

// ---------------------------------------------------------------------------------------------
// Processing
// ---------------------------------------------------------------------------------------------

export async function processVintedSoldEmail(
  email: InboundVintedSoldEmail,
  deps: VintedSoldEmailDeps = {},
): Promise<VintedSoldEmailResult> {
  const resolveOrganizerIdByToken = deps.resolveOrganizerIdByToken ?? resolveOrganizerIdByForwardingToken;
  const processTitleReport = deps.processTitleReport ?? ((orgId: string, title: string) => processVintedSoldTitleReport(orgId, title));

  if (!isExactSender(email.from)) {
    return { kind: 'ignored', reason: `sender "${email.from}" is not ${VINTED_SOLD_EMAIL_SENDER}` };
  }
  if (!isSoldSubject(email.subject)) {
    return { kind: 'ignored', reason: `subject is not "${VINTED_SOLD_EMAIL_SUBJECT}"` };
  }

  const auth = verifyInboundEmailAuthentication(email, VINTED_DKIM_DOMAINS);
  if (!auth.ok) {
    console.warn('[VintedSoldEmailDetection] rejecting sold email -- sender authentication failed', { reason: auth.reason });
    return { kind: 'ignored', reason: `sender authentication failed: ${auth.reason}` };
  }

  const tokens = new Map<string, string>();
  for (const addr of email.recipientAddresses ?? []) {
    const token = extractForwardingTokenFromAddress(addr);
    if (token && !tokens.has(token.toLowerCase())) tokens.set(token.toLowerCase(), token);
  }
  if (tokens.size === 0) {
    console.warn('[VintedSoldEmailDetection] rejecting sold email -- no sold-<token> recipient address', {
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
    console.warn(`[VintedSoldEmailDetection] rejecting sold email -- ${reason}`, { tokenCount: tokens.size });
    return { kind: 'ignored', reason };
  }
  const organizerId = [...organizerIds][0];

  const title = parseVintedSoldEmailTitle(email.rawBody);
  if (!title) {
    console.warn('[VintedSoldEmailDetection] unmatched sold email -- could not parse the item title', { organizerId });
    return { kind: 'unmatched', organizerId, title: null, reason: 'could not parse the item title from the email body' };
  }

  const r = await processTitleReport(organizerId, title);
  switch (r.result) {
    case 'sold':
    case 'alreadySold':
    case 'notAvailable':
      return {
        kind: 'matched',
        organizerId,
        itemId: r.itemId as string,
        title,
        soldVia: SOLD_VIA_VINTED,
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
      // Leave the message unread so the next poll retries (same as a Facebook processing throw).
      throw new Error(`Vinted sold commit failed for organizer ${organizerId}: ${r.reason ?? r.result}`);
  }
}
