/**
 * ADR-081: Facebook Events direct page-fetch enrichment
 *
 * Fetches the REAL facebook.com/events/<id> page (no login, no cookies, no
 * session) to replace SERP-snippet-guessed date/address/host data with real
 * values. Feature-flagged via FB_EVENTS_DIRECT_FETCH_ENABLED — if unset/false,
 * callers should skip this entirely and keep today's SERP-only behavior.
 *
 * Fetch routing (in priority order):
 *   1. Cloudflare Worker proxy (FB_EVENTS_PROXY_URL + FB_EVENTS_PROXY_TOKEN set) —
 *      routes through AS13335, bypassing Facebook's datacenter-IP block that causes
 *      100% HTTP 400/403 from Railway and GitHub Actions egress IPs (confirmed live
 *      test 2026-07-12, run #46). Same worker as fb-marketplace-proxy.
 *   2. Direct fetch fallback — used when proxy env vars are absent. Works from
 *      developer machines / Cowork sandbox (not blocked), broken from GH Actions.
 *
 * Graceful degradation is mandatory: any failure (non-200, timeout, no
 * parseable date) must return null so the caller falls back to the existing
 * SERP-derived guess. Never throw out of this module.
 */

import * as cheerio from 'cheerio';
import { getRandomUserAgent, getRandomReferer } from '../userAgents';

export interface FbEventPageData {
  startDate?: Date;
  endDate?: Date;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  organizerName?: string;
  description?: string;
}

const FETCH_TIMEOUT_MS = 15_000;

/**
 * Best-effort extraction of a JSON-LD Event block, if Facebook includes one.
 * Confirmed present-or-absent varies by page — treat as optional, not required.
 */
function extractJsonLdEvent(html: string): Record<string, any> | null {
  const $ = cheerio.load(html);
  const scripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < scripts.length; i++) {
    const raw = $(scripts[i]).contents().text();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const c of candidates) {
        if (c && (c['@type'] === 'Event' || c['@type']?.includes?.('Event'))) {
          return c;
        }
      }
    } catch {
      // Malformed JSON-LD — skip, not fatal
      continue;
    }
  }
  return null;
}

/**
 * Fallback extraction from OG meta tags — always present on a valid FB event
 * page even when no JSON-LD block exists. Weaker signal (og:description is
 * free text, not structured), used only to fill gaps JSON-LD didn't cover.
 */
function extractOgTags(html: string): { title?: string; description?: string; updatedTime?: string } {
  const $ = cheerio.load(html);
  return {
    title: $('meta[property="og:title"]').attr('content'),
    description: $('meta[property="og:description"]').attr('content'),
    updatedTime: $('meta[property="og:updated_time"]').attr('content'),
  };
}

/**
 * Parse a JSON-LD Event's startDate/endDate/location into our shape.
 * JSON-LD dates are ISO 8601 — Date constructor handles them directly.
 */
function mapJsonLdToPageData(event: Record<string, any>): FbEventPageData {
  const result: FbEventPageData = {};

  if (event.startDate) {
    const d = new Date(event.startDate);
    if (!isNaN(d.getTime())) result.startDate = d;
  }
  if (event.endDate) {
    const d = new Date(event.endDate);
    if (!isNaN(d.getTime())) result.endDate = d;
  }

  const location = event.location;
  if (location) {
    const addr = location.address;
    if (typeof addr === 'string') {
      result.address = addr;
    } else if (addr && typeof addr === 'object') {
      result.address = addr.streetAddress ?? undefined;
      result.city = addr.addressLocality ?? undefined;
      result.state = addr.addressRegion ?? undefined;
      result.zip = addr.postalCode ?? undefined;
    }
  }

  const organizer = event.organizer;
  if (organizer) {
    result.organizerName = typeof organizer === 'string' ? organizer : organizer.name;
  }

  if (event.description) {
    result.description = event.description;
  }

  return result;
}

/**
 * Fetch and parse a single Facebook event page. Returns null on any failure
 * or if no usable date could be extracted — caller must fall back to the
 * existing SERP-derived guess in that case.
 */
export async function fetchFacebookEventPage(url: string): Promise<FbEventPageData | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  // Proxy path: route through Cloudflare Worker (AS13335) when configured.
  // Set FB_EVENTS_PROXY_URL to the same worker URL as FB_MARKETPLACE_PROXY_URL,
  // and FB_EVENTS_PROXY_TOKEN to the same PROXY_TOKEN secret. The worker's
  // /fb-event-page endpoint accepts GET ?url=<encoded> with Bearer auth.
  const proxyBase  = process.env.FB_EVENTS_PROXY_URL;
  const proxyToken = process.env.FB_EVENTS_PROXY_TOKEN;
  const useProxy   = Boolean(proxyBase && proxyToken);

  try {
    let fetchUrl: string;
    let fetchInit: RequestInit;

    if (useProxy) {
      fetchUrl = `${proxyBase}/fb-event-page?url=${encodeURIComponent(url)}`;
      fetchInit = {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${proxyToken}`,
        },
      };
      console.log(`[FB-Events-PageFetch] Using Cloudflare proxy for ${url}`);
    } else {
      fetchUrl = url;
      fetchInit = {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': getRandomReferer() || 'https://www.google.com/',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'cross-site',
          'Sec-Fetch-Dest': 'document',
        },
      };
    }

    const response = await fetch(fetchUrl, fetchInit);

    if (!response.ok) {
      console.warn(`[FB-Events-PageFetch] HTTP ${response.status} for ${url} (proxy=${useProxy})`);
      return null;
    }

    const html = await response.text();

    const jsonLdEvent = extractJsonLdEvent(html);
    let result: FbEventPageData = jsonLdEvent ? mapJsonLdToPageData(jsonLdEvent) : {};

    // Fill gaps from OG tags if JSON-LD was absent or incomplete
    if (!result.description) {
      const og = extractOgTags(html);
      if (og.description) result.description = og.description;
    }

    // No usable date extracted — treat as a failed enrichment, not a partial
    // success, since date accuracy is the primary reason this module exists.
    if (!result.startDate) {
      console.warn(`[FB-Events-PageFetch] No parseable date found for ${url} — falling back to SERP guess`);
      return null;
    }

    return result;
  } catch (err) {
    console.warn(
      `[FB-Events-PageFetch] Fetch failed for ${url}:`,
      err instanceof Error ? err.message : String(err)
    );
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
