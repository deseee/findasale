/**
 * inboundEmailAuthService.ts — sender-authentication checks for the ADR-131 inbound email
 * pipeline (facebookMarketplaceEmailSoldDetection.ts, vintedSoldEmailDetection.ts,
 * gmailForwardingAutoConfirmService.ts).
 *
 * WHY: a parsed From address is trivially spoofable. Before either pipeline acts on an
 * inbound email (committing a sale, or firing a confirmation GET), it must see that the
 * RECEIVING mail server (Google, for the outreach@finda.sale Workspace mailbox) verified a
 * DKIM signature from the expected sending domain AND a DMARC pass.
 *
 * TRUST MODEL (fail closed):
 *   - Authentication-Results / ARC-Authentication-Results headers are just text, and a
 *     sender can put forged copies of either into its own message. Receiving MTAs PREPEND
 *     their trace headers, so the header Google itself added is always ABOVE anything the
 *     sender supplied. We therefore evaluate ONLY the topmost Authentication-Results header
 *     whose authserv-id is a trusted receiver (mx.google.com). Lower (older / possibly
 *     sender-supplied) copies are ignored entirely -- a forged "pass" further down can
 *     never override the receiver's own verdict.
 *   - ARC-Authentication-Results is consulted only as a fallback when NO trusted
 *     Authentication-Results header exists at all (and again only the topmost trusted
 *     one). Gmail always stamps Authentication-Results on inbound mail, so in practice the
 *     primary path decides.
 *   - Within the chosen header: pass requires at least one `dkim=pass` whose header.d (or
 *     header.i's domain) equals or is a subdomain of an allowed domain, AND `dmarc=pass`
 *     (and, if the dmarc result carries header.from, that domain must also be allowed).
 *
 * Parsing is deliberately tolerant of real-world formatting: folded lines, (comments),
 * quoted reason="..." strings containing ';', arbitrary casing, and multiple resinfo
 * entries of the same method in one header.
 */

export const TRUSTED_AUTHSERV_IDS = ['mx.google.com'];

export const FACEBOOK_DKIM_DOMAINS = ['facebookmail.com', 'facebook.com'];
export const GOOGLE_DKIM_DOMAINS = ['google.com'];
// Vinted's sale email (vintedSoldEmailDetection.ts). Observed live 2026-09-19: Gmail recorded
// dkim=pass header.i=@vinted.com (plus a second amazonses.com signature, which is NOT accepted
// here) and dmarc=pass header.from=vinted.com. Deliberately not team.vinted.com-only or
// amazonses.com: the sending ESP's own signature proves nothing about Vinted.
export const VINTED_DKIM_DOMAINS = ['vinted.com'];
// Mercari's sale email (mercariSoldEmailDetection.ts). Observed live 2026-09-02 on the real
// "You've made a sale: ..." email: dkim=pass header.i=@alerts.us.mercari.com (plus a second
// sendgrid.info signature, NOT accepted here) and dmarc=pass (p=REJECT) header.from=mercari.com.
// alerts.us.mercari.com passes as a subdomain of mercari.com.
export const MERCARI_DKIM_DOMAINS = ['mercari.com'];

interface ResInfo {
  method: string;
  result: string;
  props: Record<string, string>;
}

interface ParsedAuthResults {
  authservId: string;
  results: ResInfo[];
}

function stripCommentsAndQuotes(value: string): string {
  let out = value.replace(/\r?\n[ \t]+/g, ' ');
  // Quoted strings first (they may contain parentheses or ';'), then comments.
  out = out.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  let prev: string;
  do {
    prev = out;
    out = out.replace(/\([^()]*\)/g, ' ');
  } while (out !== prev);
  return out;
}

/** Parses one Authentication-Results (or ARC-Authentication-Results) header VALUE. */
export function parseAuthenticationResultsHeader(value: string): ParsedAuthResults | null {
  if (!value) return null;
  const segments = stripCommentsAndQuotes(value)
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (segments.length === 0) return null;

  // ARC-Authentication-Results starts with an "i=<n>" instance tag before the authserv-id.
  if (/^i\s*=\s*\d+$/i.test(segments[0])) segments.shift();
  if (segments.length === 0) return null;

  const authservId = segments[0].split(/\s+/)[0].toLowerCase();
  const results: ResInfo[] = [];

  for (const seg of segments.slice(1)) {
    const tokens = seg.replace(/\s*=\s*/g, '=').split(/\s+/).filter(Boolean);
    const m = /^([a-z0-9_.-]+)=([a-z0-9_-]+)$/i.exec(tokens[0] ?? '');
    if (!m) continue; // e.g. "none" or malformed
    const props: Record<string, string> = {};
    for (const tok of tokens.slice(1)) {
      const eq = tok.indexOf('=');
      if (eq <= 0) continue;
      props[tok.slice(0, eq).toLowerCase()] = tok.slice(eq + 1).toLowerCase();
    }
    results.push({ method: m[1].toLowerCase(), result: m[2].toLowerCase(), props });
  }

  return { authservId, results };
}

function domainAllowed(domain: string | undefined, allowed: string[]): boolean {
  if (!domain) return false;
  const d = domain.trim().toLowerCase().replace(/\.$/, '');
  if (!d) return false;
  return allowed.some((a) => d === a || d.endsWith(`.${a}`));
}

function dkimDomainOf(props: Record<string, string>): string | undefined {
  if (props['header.d']) return props['header.d'];
  const i = props['header.i'];
  if (i) {
    const at = i.lastIndexOf('@');
    return at >= 0 ? i.slice(at + 1) : i;
  }
  return undefined;
}

export interface EmailAuthInput {
  /** Every Authentication-Results header value, in the order they appear in the message
   * (topmost first). */
  authenticationResults?: string[];
  /** Every ARC-Authentication-Results header value, topmost first. */
  arcAuthenticationResults?: string[];
}

export type EmailAuthVerdict = { ok: true } | { ok: false; reason: string };

function topmostTrusted(values: string[] | undefined): ParsedAuthResults | null {
  for (const v of values ?? []) {
    const parsed = parseAuthenticationResultsHeader(v);
    if (parsed && TRUSTED_AUTHSERV_IDS.includes(parsed.authservId)) return parsed;
  }
  return null;
}

/**
 * Verifies that the receiving server recorded dkim=pass for one of `allowedDkimDomains`
 * and dmarc=pass. Returns a reason string on any failure (missing headers included).
 */
export function verifyInboundEmailAuthentication(
  input: EmailAuthInput,
  allowedDkimDomains: string[],
): EmailAuthVerdict {
  let chosen = topmostTrusted(input.authenticationResults);
  let source = 'Authentication-Results';
  if (!chosen) {
    chosen = topmostTrusted(input.arcAuthenticationResults);
    source = 'ARC-Authentication-Results';
  }
  if (!chosen) {
    return {
      ok: false,
      reason: `no Authentication-Results/ARC-Authentication-Results header from a trusted receiver (${TRUSTED_AUTHSERV_IDS.join(', ')})`,
    };
  }

  const dkimPass = chosen.results.some(
    (r) => r.method === 'dkim' && r.result === 'pass' && domainAllowed(dkimDomainOf(r.props), allowedDkimDomains),
  );
  if (!dkimPass) {
    return {
      ok: false,
      reason: `${source} (${chosen.authservId}) has no dkim=pass for ${allowedDkimDomains.join(' / ')}`,
    };
  }

  const dmarcPass = chosen.results.some(
    (r) =>
      r.method === 'dmarc' &&
      r.result === 'pass' &&
      (r.props['header.from'] === undefined || domainAllowed(r.props['header.from'], allowedDkimDomains)),
  );
  if (!dmarcPass) {
    return { ok: false, reason: `${source} (${chosen.authservId}) has no dmarc=pass for ${allowedDkimDomains.join(' / ')}` };
  }

  return { ok: true };
}

export interface RawHeaderLine {
  key: string;
  line: string;
}

/** Returns every value of header `name` (case-insensitive), in message order, from
 * mailparser's `headerLines` (whose `line` is the full raw "Name: value" text). */
export function headerValues(headerLines: RawHeaderLine[] | undefined, name: string): string[] {
  const target = name.toLowerCase();
  const out: string[] = [];
  for (const hl of headerLines ?? []) {
    if ((hl?.key ?? '').toLowerCase() !== target) continue;
    const raw = hl.line ?? '';
    const colon = raw.indexOf(':');
    out.push((colon >= 0 ? raw.slice(colon + 1) : raw).replace(/\r?\n[ \t]+/g, ' ').trim());
  }
  return out;
}

/** Extracts bare, lowercased email addresses from a raw address-list header value. */
export function extractAddresses(value: string): string[] {
  const matches = value.match(/[A-Za-z0-9._%+=-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [];
  return matches.map((a) => a.toLowerCase());
}
