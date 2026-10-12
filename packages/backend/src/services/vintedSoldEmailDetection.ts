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
  | { kind: 'unmatched'; organizerId: string; title: string | null; reason: string }
  // S-VINTED-BUNDLE-SALE (2026-10-11): a multi-item bundle sale. The email names no items, so
  // nothing is marked sold here; the poller notifies the organizer and arms the extension's
  // id-based wardrobe sold-check (vintedBundleSaleService.ts).
  | { kind: 'bundle'; organizerId: string; itemCount: number; amountText: string | null; buyer: string | null; title: string };

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

export interface ParsedVintedSoldEmail {
  /** Text between "<buyer> has bought " and the trailing price token. */
  title: string;
  /** The trailing price token as written ("$5.00"); display only, never used for matching. */
  amountText: string | null;
  /** The single-token buyer handle; untrusted, display only. */
  buyer: string | null;
}

/**
 * Parses a Vinted "You sold ..." body (HTML or text). Returns null when the expected sentence or
 * a price token is not found (fail closed).
 */
export function parseVintedSoldEmail(body: string | null | undefined): ParsedVintedSoldEmail | null {
  if (!body) return null;
  const text = htmlToPlainText(body);
  const m = SOLD_BODY_RE.exec(text);
  if (!m) return null;
  const segment = m[1].trim();
  const pm = TRAILING_PRICE_RE.exec(segment);
  if (!pm || pm.index === 0) return null; // no price token, or nothing before it
  const title = segment.slice(0, pm.index).trim();
  if (!title) return null;
  const buyerMatch = /(\S+) has bought\b/i.exec(text);
  return {
    title: title.slice(0, MAX_TITLE_LEN),
    amountText: pm[0].trim().replace(/[.,\s]+$/, '') || null,
    buyer: buyerMatch ? buyerMatch[1].slice(0, 60) : null,
  };
}

/**
 * Extracts the sold item's title from a Vinted "You sold an item" body (HTML or text).
 * Returns null when the expected sentence or a price token is not found (fail closed).
 */
export function parseVintedSoldEmailTitle(body: string | null | undefined): string | null {
  return parseVintedSoldEmail(body)?.title ?? null;
}

// "Bundle 5 items", "Bundle of 5 items", "5 items bundle" anywhere in the parsed title.
// Vinted's bundle email shows the bundle label instead of an item title (live 2026-10-11:
// "duck212 has bought Bundle 5 items ... $5.00"). Only consulted AFTER a normal title match has
// failed, so a real single listing whose title happens to start "Bundle 3 items ..." still sells
// through the normal path.
const BUNDLE_TITLE_RE = /\bbundle\s+(?:of\s+)?(\d{1,3})\s+items?\b|\b(\d{1,3})\s+items?\s+bundle\b/i;

/** Item count of a Vinted bundle label, or null when the title is not a bundle label. */
export function parseVintedBundleItemCount(title: string | null | undefined): number | null {
  const m = BUNDLE_TITLE_RE.exec(String(title ?? ''));
  if (!m) return null;
  const n = parseInt(m[1] ?? m[2], 10);
  return Number.isFinite(n) && n >= 1 && n <= 200 ? n : null;
}

export interface ParsedVintedBundleBody {
  itemCount: number;
  amountText: string | null;
  buyer: string | null;
}

const ANY_PRICE_RE = new RegExp(PRICE);

/**
 * Lenient bundle detector for a body that parseVintedSoldEmail could not parse (e.g. the "We will
 * transfer" sentence is worded differently in the bundle email): finds "<buyer> has bought <...>"
 * and requires a bundle label within the next ~200 characters. Returns null for anything else, so a
 * single-item sale or an unrelated email never qualifies. Display fields only; nothing derived here
 * is ever used to mark an item sold.
 */
export function parseVintedBundleFromBody(body: string | null | undefined): ParsedVintedBundleBody | null {
  if (!body) return null;
  const text = htmlToPlainText(body);
  const m = /(\S+) has bought\s+(.*)$/i.exec(text);
  if (!m) return null;
  const seg = m[2].slice(0, 200);
  const itemCount = parseVintedBundleItemCount(seg);
  if (itemCount === null) return null;
  const pm = ANY_PRICE_RE.exec(seg);
  return {
    itemCount,
    amountText: pm ? pm[0].trim().replace(/[.,\s]+$/, '') || null : null,
    buyer: m[1].slice(0, 60),
  };
}

/** Subject text for logs only: untrusted, so control characters are dropped and the length capped. */
function subjectForLog(subject: string): string {
  return String(subject ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 200);
}

function isExactSender(from: string): boolean {
  return String(from ?? '').trim().toLowerCase() === VINTED_SOLD_EMAIL_SENDER;
}

// "You sold an item on Vinted" (single item, observed) plus bundle phrasings (PROVISIONAL: the
// bundle subject has not been observed; sender + DKIM + the "has bought" body sentence still gate
// everything). Look-alikes with trailing text ("...Vinted!!") and bare prefixes stay ignored.
const SOLD_SUBJECT_RE =
  /^(?:You sold|You've sold|You have sold) (?:an item|a bundle|your bundle|\d{1,3} items|a bundle of \d{1,3} items|\d{1,3} items in a bundle|an item bundle) on Vinted$/;

function isSoldSubject(subject: string): boolean {
  const s = String(subject ?? '').trim();
  return s === VINTED_SOLD_EMAIL_SUBJECT || SOLD_SUBJECT_RE.test(s);
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
  // 2026-10-12: the real bundle email's subject was never observed (the first bundle sale produced
  // no log line at all), so every Vinted email whose subject is not accepted is logged ONCE here
  // (info level) with its actual subject. A rejected subject is still accepted when the BODY is
  // unmistakably a bundle sale ("<buyer> has bought ... Bundle N items ..."): that route can only
  // ever notify the organizer (kind 'bundle' marks nothing sold), and it still has to pass the
  // sender + DKIM + organizer-token guards below.
  let bundleViaBody: ParsedVintedBundleBody | null = null;
  if (!isSoldSubject(email.subject)) {
    bundleViaBody = parseVintedBundleFromBody(email.rawBody);
    console.log(
      `[VintedSoldEmailDetection] subject not accepted as a sold subject: "${subjectForLog(email.subject)}"` +
        (bundleViaBody ? ' -- but the body is a bundle sale, continuing to the guards' : ' -- ignored'),
    );
    if (!bundleViaBody) {
      return { kind: 'ignored', reason: `subject is not "${VINTED_SOLD_EMAIL_SUBJECT}"` };
    }
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

  if (bundleViaBody) {
    return {
      kind: 'bundle',
      organizerId,
      itemCount: bundleViaBody.itemCount,
      amountText: bundleViaBody.amountText,
      buyer: bundleViaBody.buyer,
      title: `Bundle ${bundleViaBody.itemCount} items`,
    };
  }

  const parsed = parseVintedSoldEmail(email.rawBody);
  const title = parsed?.title ?? null;
  if (!parsed || !title) {
    const lenientBundle = parseVintedBundleFromBody(email.rawBody);
    if (lenientBundle) {
      return {
        kind: 'bundle',
        organizerId,
        itemCount: lenientBundle.itemCount,
        amountText: lenientBundle.amountText,
        buyer: lenientBundle.buyer,
        title: `Bundle ${lenientBundle.itemCount} items`,
      };
    }
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
    case 'notFound': {
      // No listing carries this title. If it is a bundle label, route to bundle handling instead
      // of a dead-end "unmatched" (nothing is marked sold either way).
      const itemCount = parseVintedBundleItemCount(title);
      if (itemCount !== null) {
        return { kind: 'bundle', organizerId, itemCount, amountText: parsed.amountText, buyer: parsed.buyer, title };
      }
      return { kind: 'unmatched', organizerId, title, reason: r.reason ?? 'no_match' };
    }
    case 'error':
    default:
      // Leave the message unread so the next poll retries (same as a Facebook processing throw).
      throw new Error(`Vinted sold commit failed for organizer ${organizerId}: ${r.reason ?? r.result}`);
  }
}
