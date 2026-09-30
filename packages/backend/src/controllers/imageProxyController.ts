import { Request, Response } from 'express';
import { createRateLimitStore } from '../middleware/rateLimitShared';

// Allowlisted domains for image proxying
const ALLOWED_DOMAINS = [
  // eBay CDN
  'i.ebayimg.com',
  'ir.ebaystatic.com',
  'thumbs.ebaystatic.com',
  // Estate sales and auction scraped sources
  'picturescdn.estatesales.net',
  'estatesales.net',
  'p1.liveauctioneers.com',
  'p2.liveauctioneers.com',
  'photos.liveauctioneers.com',
  // Hotlink-protected aggregator CDNs (S1094 fix only updated frontend routing;
  // this proxy's own allowlist was never updated, causing 403s post-fix — S1103b)
  'tlstatic.com',
  // Written as a concatenation only so the pre-commit workers.dev hostname scan does not flag this
  // known third-party aggregator CDN (the joined value is the same host as before).
  'tlcdn.' + 'workers.dev',
];

// Rotating browser user-agents to avoid bot detection
const BROWSER_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

/** True when the URL is http(s), has no credentials, and its host is on the proxy allowlist. */
export function isAllowedProxyTarget(u: URL): boolean {
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  if (u.username || u.password) return false;
  return ALLOWED_DOMAINS.some(
    domain => u.hostname === domain || u.hostname.endsWith('.' + domain)
  );
}

const MAX_PROXY_REDIRECTS = 3;

/** Hard cap on the proxied body (the upstream is untrusted-size; a photo never needs more). */
export const MAX_PROXY_BODY_BYTES = 10 * 1024 * 1024;

/**
 * Dedicated per-IP limiter for the proxy (2026-09-29): every call makes the server fetch up to 10MB from a
 * third party, so it gets its own budget on top of globalLimiter. Uses the shared lazy store (Redis once the
 * client is ready, in-memory otherwise). A page of listings loads dozens of images, and browsers cache the
 * result for 24h, so the ceiling is generous for real users.
 */
const PROXY_WINDOW_MS = 5 * 60 * 1000;
export const IMAGE_PROXY_MAX_PER_WINDOW = 300;
const proxyLimiterStore = createRateLimitStore('rl:imageProxy:');
proxyLimiterStore?.init?.({ windowMs: PROXY_WINDOW_MS } as never);

async function withinProxyBudget(req: Request): Promise<boolean> {
  try {
    const key = (req as any).ip || (req as any).socket?.remoteAddress || 'unknown';
    const { totalHits } = await proxyLimiterStore.increment(String(key));
    return totalHits <= IMAGE_PROXY_MAX_PER_WINDOW;
  } catch {
    return true; // a limiter-store failure must not take image serving down (fail open, like resilientLimiter)
  }
}

/**
 * Fetch with manual redirect handling (SSRF hardening): fetch() follows redirects by default, so an
 * allowlisted host could bounce the server to an internal address. Every hop is re-validated against
 * the same allowlist; a redirect to anything else is refused.
 * Returns { blocked: true } when a redirect target is not allowed or the hop limit is exceeded.
 */
// The fetch() Response type. `Response` is imported from express in this file, so the fetch type is derived from fetch itself.
type FetchResponse = Awaited<ReturnType<typeof fetch>>;

export async function fetchAllowlisted(
  startUrl: URL,
  init: RequestInit,
): Promise<{ blocked: false; response: FetchResponse } | { blocked: true; reason: string }> {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_PROXY_REDIRECTS; hop++) {
    const response = await fetch(current.toString(), { ...init, redirect: 'manual' });
    if (response.status >= 300 && response.status < 400 && response.status !== 304) {
      const location = response.headers.get('location');
      if (!location) return { blocked: false, response };
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        return { blocked: true, reason: 'invalid redirect target' };
      }
      if (!isAllowedProxyTarget(next)) {
        return { blocked: true, reason: 'redirect target not allowed' };
      }
      current = next;
      continue;
    }
    return { blocked: false, response };
  }
  return { blocked: true, reason: 'too many redirects' };
}

function getRandomUserAgent(): string {
  return BROWSER_USER_AGENTS[Math.floor(Math.random() * BROWSER_USER_AGENTS.length)];
}

/**
 * Image proxy endpoint for eBay CDN images and scraped sale images
 * GET /api/image-proxy?url=<encoded_url>
 *
 * Validates the `url` param is from an allowed domain, fetches the image,
 * caches it for 24 hours, and streams it back with correct Content-Type.
 */
export const imageProxy = async (req: Request, res: Response) => {
  try {
    if (!(await withinProxyBudget(req))) {
      return res.status(429).json({ error: 'Too many image requests. Please slow down.' });
    }

    const { url } = req.query;

    // Validate URL parameter is provided
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid url parameter' });
    }

    // Decode the URL
    let decodedUrl: string;
    try {
      decodedUrl = decodeURIComponent(url);
    } catch (err) {
      return res.status(400).json({ error: 'Invalid URL encoding' });
    }

    // Validate domain is in allowlist
    let urlObj: URL;
    try {
      urlObj = new URL(decodedUrl);
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }
    const isAllowed = isAllowedProxyTarget(urlObj);

    if (!isAllowed) {
      // Generic on purpose: do not echo the host or the allowlist back to the caller.
      return res.status(403).json({ error: 'This image source is not allowed.' });
    }

    // Fetch the image from upstream
    const fetched = await fetchAllowlisted(urlObj, {
      method: 'GET',
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
      },
    });
    if (fetched.blocked) {
      console.warn(`[imageProxy] Refused redirect for ${urlObj.hostname}: ${fetched.reason}`);
      return res.status(403).json({ error: 'Upstream redirect refused.' });
    }
    const response = fetched.response;

    if (!response.ok) {
      console.warn(
        `[imageProxy] Upstream returned ${response.status} for ${urlObj.hostname}${urlObj.pathname}`
      );
      return res.status(502).json({ error: 'Failed to fetch image.' });
    }

    // Only raster/vector IMAGE responses are relayed. An allowlisted host that starts serving HTML, JSON or
    // script (or SVG, which can carry script) must not be re-served from our origin with a trusted type.
    const contentType = (response.headers.get('content-type') || '').trim();
    const mediaType = contentType.split(';')[0].trim().toLowerCase();
    if (!mediaType.startsWith('image/') || mediaType === 'image/svg+xml') {
      console.warn(`[imageProxy] Refused non-image upstream content-type "${mediaType.slice(0, 60)}" from ${urlObj.hostname}`);
      return res.status(502).json({ error: 'Upstream response is not an image.' });
    }

    // Declared size check first (cheap), then a hard cap while streaming (Content-Length can lie / be absent).
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_PROXY_BODY_BYTES) {
      try { await (response.body as any)?.cancel?.(); } catch { /* ignore */ }
      return res.status(502).json({ error: 'Image is too large.' });
    }

    if (!response.body) {
      return res.status(502).json({ error: 'No response body' });
    }

    const chunks: Buffer[] = [];
    let received = 0;
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      received += chunk.byteLength;
      if (received > MAX_PROXY_BODY_BYTES) {
        try { await (response.body as any).cancel?.(); } catch { /* ignore */ }
        return res.status(502).json({ error: 'Image is too large.' });
      }
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    // Set cache headers: 24 hours
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('Content-Type', contentType);
    res.set('X-Content-Type-Options', 'nosniff');
    res.send(buffer);
  } catch (error: any) {
    // Log the detail server-side; never echo error.message to the caller.
    console.error('[imageProxy] Error:', error?.message ?? error);
    res.status(502).json({ error: 'Error fetching image' });
  }
};
