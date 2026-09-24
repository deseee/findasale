/**
 * poshmarkSoldEmailDetection.ts -- Poshmark branch of the ADR-131 inbound sold-email pipeline
 * (2026-09-23). Sibling of mercariSoldEmailDetection.ts, same guards in the same order.
 *
 * STATUS: RESEARCH-BUILT, NOT YET SEEN LIVE. No real Poshmark sale email has reached the
 * outreach@finda.sale mailbox yet. The template below comes from six independent sources that
 * agree with each other, two of them code that parses real Poshmark mail:
 *   - reddit.com/r/poshmark/comments/1qi5z8n (seller screenshots of the sale email)
 *   - github.com/Fortee2/ListFlow (parser for the real "just sold to" email)
 *   - github.com/ceponatia/label-agent (parser for the real email and its label PDF)
 *   - theresaledoctor.com/poshmark-for-beginners (walkthrough of the sale email)
 *   - blog.poshmark.com/2015/03/18/posh-tip-help-us-help-you (Poshmark's own description)
 * The first processed email logs a distinct 'poshmark_first_live_email' warn so the first real
 * one can be checked against this template.
 *
 * EXPECTED EMAIL:
 *   From:    Poshmark <orders@poshmark.com>
 *   Subject: "<title>" just sold to <@buyer | guest Posher> on Poshmark!
 *   Body:    Hi Pat! Great news - you just sold "<title>" on Poshmark. Please package your
 *            sale ... Buyer / Order Date / Order ID <24 hex> / Tracking Number / <title> / Size /
 *            Price / Your Earnings ... Happy Poshing! The Poshmark Team
 *   Attachment: "pre-paid mailing label....pdf", or (label outage) body text "shipping label
 *            system is experiencing delays".
 * Poshmark also sends "Thanks for shipping order ...", "Reminder to ship", return decisions,
 * offers, and promos from info@poshmark.com / shop@poshmark.com. None of those can mark anything
 * sold: the exact sender AND the exact subject shape must both match.
 *
 * GUARDS (fail closed, same as the Vinted/Mercari/Facebook branches):
 *   1. Exact sender orders@poshmark.com (case-insensitive). A display name other than "Poshmark"
 *      is refused (an empty/missing one is allowed and logged). Curly quotes in the subject are
 *      normalized, then it must match ^"<title>" just sold to <buyer> on Poshmark!$ (title is
 *      greedy, so it ends at the LAST `" just sold to `). Anything else -> 'ignored'.
 *   1a. Topmost mx.google.com Authentication-Results: dkim=pass for poshmark.com (subdomains ok)
 *       and dmarc=pass (POSHMARK_DKIM_DOMAINS). A SendGrid signature alone never passes.
 *   1b. Organizer from the sold-<token> recipient; none or more than one organizer -> 'ignored'.
 *   2. Title: the body sentence `you just sold "<title>" on Poshmark.` wins over the subject when
 *      they disagree. Order ID and label PDF / label-outage text are logged as corroboration only.
 *   3. Bundles ("3 items in bundle", "Bundle ...") -> 'unmatched' with reason 'bundle_sale' and
 *      nothing is committed: one email covers several items and names none of them.
 *   4. processPlatformSoldReport('POSHMARK', 'POSHMARK', ...): unique normalized title (8+
 *      chars), never fuzzy. The item's POSHMARK listing record is closed, then the sale is
 *      committed. 'error' throws so the poller leaves the message unread for retry.
 *
 * FORWARDING: Gmail filter/auto-forward only. A hand-forwarded "Fwd:" copy has the organizer as
 * sender and fails guard 1, same as the other platforms.
 */

import {
  resolveOrganizerIdByForwardingToken,
  extractForwardingTokenFromAddress,
} from './organizerEmailForwardingService';
import { verifyInboundEmailAuthentication, POSHMARK_DKIM_DOMAINS } from './inboundEmailAuthService';
import { htmlToPlainText } from './vintedSoldEmailDetection';
import { processPlatformSoldReport, type PlatformSoldResult } from './platformSoldDetectionService';

export const POSHMARK_SOLD_EMAIL_SENDER = 'orders@poshmark.com';
export const POSHMARK_SOLD_EMAIL_DISPLAY_NAME = 'Poshmark';
export const SOLD_VIA_POSHMARK = 'POSHMARK';
const MAX_TITLE_LEN = 500;

export interface InboundPoshmarkSoldEmail {
  from: string;
  /** Display name of the From address, when the transport has it. */
  fromName?: string;
  subject: string;
  links?: string[];
  rawBody?: string;
  /** File names of the message's attachments (corroboration only). */
  attachmentNames?: string[];
  authenticationResults?: string[];
  arcAuthenticationResults?: string[];
  recipientAddresses?: string[];
}

export type PoshmarkSoldEmailResult =
  | { kind: 'ignored'; reason: string }
  | {
      kind: 'matched';
      organizerId: string;
      itemId: string;
      title: string;
      poshmarkOrderId: string | null;
      soldVia: typeof SOLD_VIA_POSHMARK;
      alreadySold: boolean;
      result: PlatformSoldResult['result'];
    }
  | { kind: 'ambiguous'; organizerId: string; title: string; candidateCount: number | null; reason: string }
  | { kind: 'unmatched'; organizerId: string; title: string | null; reason: string };

export interface PoshmarkSoldEmailDeps {
  resolveOrganizerIdByToken?: (token: string) => Promise<string | null>;
  processReport?: (organizerId: string, title: string) => Promise<PlatformSoldResult>;
}

// ---------------------------------------------------------------------------------------------
// Parsing (pure)
// ---------------------------------------------------------------------------------------------

/** Curly/typographic quotes to straight ones. */
export function normalizeQuotes(s: string): string {
  return String(s ?? '')
    .replace(/[“”„‟″«»]/g, '"')
    .replace(/[‘’‚‛′]/g, "'");
}

// Greedy title: ends at the LAST `" just sold to `, so a title containing that phrase survives.
const SUBJECT_RE = /^"(.+)" just sold to (.+?) on Poshmark!$/;

/** { title, buyer } from the sale subject, or null when the subject is anything else. */
export function parsePoshmarkSubject(subject: string | null | undefined): { title: string; buyer: string } | null {
  const m = SUBJECT_RE.exec(normalizeQuotes(String(subject ?? '')).trim());
  if (!m) return null;
  const title = m[1].trim();
  const buyer = m[2].trim();
  if (!title || !buyer) return null;
  return { title: title.slice(0, MAX_TITLE_LEN), buyer };
}

const BODY_TITLE_RE = /you just sold "(.+?)" on Poshmark\./i;
const ORDER_ID_RE = /\bOrder ID\s*:?\s*([0-9a-f]{24})\b/i;
const LABEL_OUTAGE_RE = /shipping label system is experiencing delays/i;
const LABEL_PDF_PREFIX = 'pre-paid mailing label';

export interface PoshmarkBodyFacts {
  title: string | null;
  orderId: string | null;
  labelOutageNotice: boolean;
}

/** Title and corroborating facts from the body (HTML stripped, entities decoded). */
export function parsePoshmarkSoldEmailBody(body: string | null | undefined): PoshmarkBodyFacts {
  if (!body) return { title: null, orderId: null, labelOutageNotice: false };
  const text = normalizeQuotes(htmlToPlainText(body));
  const t = BODY_TITLE_RE.exec(text);
  const title = t ? t[1].trim().slice(0, MAX_TITLE_LEN) || null : null;
  const o = ORDER_ID_RE.exec(text);
  return { title, orderId: o ? o[1].toLowerCase() : null, labelOutageNotice: LABEL_OUTAGE_RE.test(text) };
}

export function hasPoshmarkLabelPdf(attachmentNames: string[] | undefined): boolean {
  return (attachmentNames ?? []).some((n) => String(n ?? '').trim().toLowerCase().startsWith(LABEL_PDF_PREFIX));
}

/** "2 items in bundle", "1 item in bundle", or anything starting with "Bundle". */
export function isPoshmarkBundleTitle(title: string): boolean {
  const t = String(title ?? '').trim();
  return /^\d+ items? in bundle$/i.test(t) || /^bundle\b/i.test(t);
}

function isExactSender(from: string): boolean {
  return String(from ?? '').trim().toLowerCase() === POSHMARK_SOLD_EMAIL_SENDER;
}

function squash(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

// First-live-email marker: this branch was built from research, so the first one processed gets
// its own warn line to find in the logs.
let firstLiveEmailLogged = false;
/** Test hook. */
export function __resetPoshmarkFirstLiveEmailLog(): void {
  firstLiveEmailLogged = false;
}

// ---------------------------------------------------------------------------------------------
// Processing
// ---------------------------------------------------------------------------------------------

export async function processPoshmarkSoldEmail(
  email: InboundPoshmarkSoldEmail,
  deps: PoshmarkSoldEmailDeps = {},
): Promise<PoshmarkSoldEmailResult> {
  const resolveOrganizerIdByToken = deps.resolveOrganizerIdByToken ?? resolveOrganizerIdByForwardingToken;
  const processReport =
    deps.processReport ??
    ((orgId: string, title: string) =>
      processPlatformSoldReport('POSHMARK', SOLD_VIA_POSHMARK, orgId, { remoteListingId: '', title }));

  if (!isExactSender(email.from)) {
    return { kind: 'ignored', reason: `sender "${email.from}" is not ${POSHMARK_SOLD_EMAIL_SENDER}` };
  }
  const displayName = typeof email.fromName === 'string' ? email.fromName.trim() : '';
  if (displayName && displayName.toLowerCase() !== POSHMARK_SOLD_EMAIL_DISPLAY_NAME.toLowerCase()) {
    return { kind: 'ignored', reason: `display name "${displayName}" is not ${POSHMARK_SOLD_EMAIL_DISPLAY_NAME}` };
  }
  const subject = parsePoshmarkSubject(email.subject);
  if (!subject) {
    return { kind: 'ignored', reason: 'subject is not "<title>" just sold to <buyer> on Poshmark!' };
  }

  const auth = verifyInboundEmailAuthentication(email, POSHMARK_DKIM_DOMAINS);
  if (!auth.ok) {
    console.warn('[PoshmarkSoldEmailDetection] rejecting sold email -- sender authentication failed', { reason: auth.reason });
    return { kind: 'ignored', reason: `sender authentication failed: ${auth.reason}` };
  }

  const tokens = new Map<string, string>();
  for (const addr of email.recipientAddresses ?? []) {
    const token = extractForwardingTokenFromAddress(addr);
    if (token && !tokens.has(token.toLowerCase())) tokens.set(token.toLowerCase(), token);
  }
  if (tokens.size === 0) {
    console.warn('[PoshmarkSoldEmailDetection] rejecting sold email -- no sold-<token> recipient address', {
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
    console.warn(`[PoshmarkSoldEmailDetection] rejecting sold email -- ${reason}`, { tokenCount: tokens.size });
    return { kind: 'ignored', reason };
  }
  const organizerId = [...organizerIds][0];

  const body = parsePoshmarkSoldEmailBody(email.rawBody);
  const labelPdf = hasPoshmarkLabelPdf(email.attachmentNames);
  const corroboration = {
    orderId: body.orderId,
    labelPdf,
    labelOutageNotice: body.labelOutageNotice,
    bodyTitleFound: body.title !== null,
  };

  if (!firstLiveEmailLogged) {
    firstLiveEmailLogged = true;
    console.warn(
      '[PoshmarkSoldEmailDetection] poshmark_first_live_email -- first Poshmark sale email processed by this research-built branch; check it against the template',
      { organizerId, subject: email.subject, displayName: displayName || null, ...corroboration },
    );
  }
  if (!displayName) {
    console.log('[PoshmarkSoldEmailDetection] sale email has no display name (expected "Poshmark"); continuing on sender + DKIM');
  }

  let title = subject.title;
  if (body.title && squash(body.title) !== squash(subject.title)) {
    console.warn('[PoshmarkSoldEmailDetection] subject and body titles disagree -- using the body title', {
      organizerId,
      subjectTitle: subject.title,
      bodyTitle: body.title,
    });
    title = body.title;
  } else if (body.title) {
    title = body.title;
  }

  console.log('[PoshmarkSoldEmailDetection] corroboration', { organizerId, ...corroboration });

  if (isPoshmarkBundleTitle(title)) {
    console.warn('[PoshmarkSoldEmailDetection] bundle_sale -- one email covers several items, nothing committed', {
      organizerId,
      title,
      orderId: body.orderId,
    });
    return { kind: 'unmatched', organizerId, title, reason: 'bundle_sale' };
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
        poshmarkOrderId: body.orderId,
        soldVia: SOLD_VIA_POSHMARK,
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
      throw new Error(`Poshmark sold commit failed for organizer ${organizerId}: ${r.reason ?? r.result}`);
  }
}
