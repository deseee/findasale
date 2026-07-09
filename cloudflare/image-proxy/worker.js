/**
 * Cloudflare Worker — Image Proxy
 *
 * Serves as a global edge proxy for images from allowlisted domains.
 * Replaces Railway-based image proxy, distributing requests across Cloudflare's
 * global edge network (100k req/day free tier).
 *
 * Usage: GET https://findasale-image-proxy.workers.dev/proxy?url=<encoded-url>
 *
 * Request: GET /proxy?url=https%3A%2F%2Fi.ebayimg.com%2Fimages%2Fg%2FoEAAOSw...
 * Response: 200 OK + image bytes
 *           403 Forbidden (domain not allowed)
 *           400 Bad Request (missing/invalid URL param)
 *           502 Bad Gateway (upstream fetch failed)
 */

// Allowlisted domains (must match imageProxyController.ts exactly)
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
  // this Worker's own allowlist was never updated, causing 403s post-fix — S1103b)
  'tlstatic.com',
  'tlcdn.workers.dev',
];

// Rotating browser user-agents to avoid bot detection
const BROWSER_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

function getRandomUserAgent() {
  return BROWSER_USER_AGENTS[Math.floor(Math.random() * BROWSER_USER_AGENTS.length)];
}

function isDomainAllowed(hostname) {
  return ALLOWED_DOMAINS.some(
    domain => hostname === domain || hostname.endsWith('.' + domain)
  );
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Only handle /proxy requests
    if (url.pathname !== '/proxy') {
      return new Response('Not Found', { status: 404 });
    }

    // GET only
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // Extract and validate url parameter
    const encodedUrl = url.searchParams.get('url');
    if (!encodedUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing url parameter' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Decode the URL
    let decodedUrl;
    try {
      decodedUrl = decodeURIComponent(encodedUrl);
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'Invalid URL encoding' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Parse and validate URL
    let urlObj;
    try {
      urlObj = new URL(decodedUrl);
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'Invalid URL format' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Validate domain is in allowlist
    if (!isDomainAllowed(urlObj.hostname)) {
      return new Response(
        JSON.stringify({
          error: `Domain ${urlObj.hostname} not allowed. Allowed domains: ${ALLOWED_DOMAINS.join(', ')}`,
        }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Fetch the image from upstream with browser-like headers
    try {
      const response = await fetch(decodedUrl, {
        method: 'GET',
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': `https://${urlObj.hostname}/`,
        },
        cf: {
          cacheEverything: true,
          cacheTtl: 86400, // 24 hours
        },
      });

      if (!response.ok) {
        console.warn(
          `[imageProxy] Upstream returned ${response.status} for ${decodedUrl}`
        );
        return new Response(
          JSON.stringify({
            error: `Failed to fetch image: ${response.status}`,
          }),
          {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      // Build response headers
      const headers = new Headers();

      // Copy Content-Type from upstream
      const contentType = response.headers.get('content-type');
      if (contentType) {
        headers.set('Content-Type', contentType);
      }

      // Set cache headers: 24 hours (browser cache)
      headers.set('Cache-Control', 'public, max-age=86400');

      // Allow all origins (images are public)
      headers.set('Access-Control-Allow-Origin', '*');

      // Clone the response and return
      return new Response(response.body, {
        status: 200,
        headers,
      });
    } catch (error) {
      console.error('[imageProxy] Fetch error:', error);
      return new Response(
        JSON.stringify({
          error: 'Error fetching image',
          message: error.message,
        }),
        {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  },
};
