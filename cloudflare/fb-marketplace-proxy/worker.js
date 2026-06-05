/**
 * Cloudflare Worker — Facebook Marketplace GraphQL Proxy
 *
 * Routes Facebook Marketplace GraphQL requests through Cloudflare's edge network
 * (AS13335) to bypass Facebook's IP block on cloud datacenter ASNs (GCP/Railway,
 * AWS, Azure).
 *
 * Background:
 *   Facebook's GraphQL endpoint returns 200 OK with HTML (no listings) when called
 *   from GCP/AWS/Azure ASNs. Live testing 2026-06-05 confirmed:
 *     - Railway (GCP, AS396982) → 0 listings, HTML response (IP-level block)
 *     - Cloudflare Worker (AS13335) → real GraphQL JSON response
 *   Cloudflare's ASN is widely used for legitimate traffic and not blocked.
 *
 * Capacity:
 *   Free tier: 100k requests/day. Scraper performs ~129 requests per full pass
 *   (43 metros × 3 queries). Well under the cap.
 *
 * Endpoint:
 *   POST https://findasale-fb-proxy.<account>.workers.dev/fb-graphql
 *
 * Auth:
 *   Authorization: Bearer <PROXY_TOKEN>
 *   (PROXY_TOKEN is a Worker secret set via `wrangler secret put PROXY_TOKEN`;
 *    Railway must send the same value in FB_MARKETPLACE_PROXY_TOKEN.)
 *
 * Body:
 *   application/x-www-form-urlencoded — raw doc_id + variables body, forwarded
 *   to Facebook unchanged.
 *
 * Returns:
 *   Facebook's GraphQL JSON response. Upstream status code is mirrored.
 *
 * Errors:
 *   400 — empty body
 *   401 — missing or invalid bearer token
 *   404 — wrong path (only / and /fb-graphql are valid)
 *   405 — wrong HTTP method (POST only on /fb-graphql)
 *   500 — PROXY_TOKEN secret not configured on the Worker
 *   502 — upstream Facebook fetch failed
 */

const FB_GRAPHQL_ENDPOINT = 'https://www.facebook.com/api/graphql/';

// Rotating browser user-agents — mirror what a real Marketplace browser sends
const BROWSER_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

const REFERERS = [
  'https://www.facebook.com/marketplace/',
  'https://www.facebook.com/marketplace/category/search/',
  'https://www.facebook.com/marketplace/learnmore/',
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/' || url.pathname === '/health') {
      return jsonResponse(200, {
        status: 'ok',
        service: 'findasale-fb-proxy',
        time: new Date().toISOString(),
      });
    }

    if (url.pathname !== '/fb-graphql') {
      return new Response('Not Found', { status: 404 });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // Bearer auth — fail closed if the secret isn't configured
    const expectedToken = env.PROXY_TOKEN;
    if (!expectedToken) {
      console.error('[fb-proxy] PROXY_TOKEN secret not set on Worker');
      return jsonResponse(500, {
        error: 'Proxy not configured: PROXY_TOKEN secret missing',
      });
    }

    const authHeader = request.headers.get('Authorization') || '';
    const providedToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : '';
    if (!providedToken || providedToken !== expectedToken) {
      return jsonResponse(401, { error: 'Unauthorized' });
    }

    // Read body once (we forward as-is)
    const body = await request.text();
    if (!body) {
      return jsonResponse(400, { error: 'Empty request body' });
    }

    // Forward to Facebook with browser-like headers
    try {
      const upstream = await fetch(FB_GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': pick(BROWSER_USER_AGENTS),
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Origin': 'https://www.facebook.com',
          'Referer': pick(REFERERS),
          'sec-fetch-site': 'same-origin',
          'sec-fetch-mode': 'cors',
          'sec-fetch-dest': 'empty',
          'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
        },
        body,
      });

      const responseBody = await upstream.text();
      const contentType =
        upstream.headers.get('content-type') || 'application/json';

      return new Response(responseBody, {
        status: upstream.status,
        headers: {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
          'X-Proxy-Upstream-Status': String(upstream.status),
        },
      });
    } catch (err) {
      console.error('[fb-proxy] upstream fetch failed:', err);
      return jsonResponse(502, {
        error: 'Upstream fetch failed',
        message: err && err.message ? err.message : String(err),
      });
    }
  },
};
