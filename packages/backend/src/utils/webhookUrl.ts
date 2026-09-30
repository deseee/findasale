/**
 * webhookUrl.ts -- outbound webhook URL policy (2026-09-29).
 *
 * Organizers register URLs that the server later POSTs to, so a URL is an SSRF vector: without a guard an
 * organizer can aim the server at the cloud metadata address, localhost or an internal service and read
 * the effect (or just cause it). One policy is shared by create, update and delivery so they cannot drift:
 *
 *   - production: https only, no credentials, port 443, a real DNS name (never an IP literal, never
 *     localhost / .internal / single-label). Exactly isSafePublicUrlSyntax from safeFetchPublicUrl.ts.
 *   - non-production: plain http is also accepted (a developer testing against a tunnel), every other rule
 *     is unchanged. localhost and private addresses are still refused by the connection-time pinning.
 *
 * Delivery additionally checks DNS before sending and pins the connection (SAFE_PUBLIC_AXIOS_OPTIONS), so a
 * name that later resolves to an internal address is refused at connect time. Redirects are never followed.
 * Never throws.
 */

import { isSafePublicUrlSyntax } from './safeFetchPublicUrl';

export const WEBHOOK_URL_ERROR = 'Webhook URL must be a public https address (no IP addresses, localhost, credentials or custom ports).';

function allowInsecureHttp(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/** True when `raw` is an acceptable webhook destination by syntax alone (no DNS). */
export function isSafeWebhookUrl(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (isSafePublicUrlSyntax(trimmed)) return true;
  if (allowInsecureHttp() && /^http:\/\//i.test(trimmed)) {
    return isSafePublicUrlSyntax(trimmed.replace(/^http:/i, 'https:'));
  }
  return false;
}

/** Host name only, for logs. Never includes the path or query string (they can carry a token). */
export function webhookLogHost(raw: unknown): string {
  try {
    return new URL(String(raw)).hostname || 'unknown-host';
  } catch {
    return 'invalid-url';
  }
}
