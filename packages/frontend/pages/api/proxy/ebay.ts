/**
 * eBay API Proxy — Vercel API Route (Option B fallback)
 *
 * Railway backend calls this endpoint; Vercel's IPs make the request to api.ebay.com.
 * Railway's datacenter IPs are blocked by eBay's DNS/firewall; Vercel's are not.
 *
 * Usage (from Railway backend):
 *   POST /api/proxy/ebay?path=/identity/v1/oauth2/token
 *   Headers: X-Proxy-Secret, Authorization, Content-Type
 *   Body: forwarded as-is to eBay
 *
 * Security: requests must include X-Proxy-Secret matching EBAY_PROXY_SECRET env var.
 * Set EBAY_PROXY_SECRET in both Vercel and Railway environment variables.
 */
import type { NextApiRequest, NextApiResponse } from 'next';

const EBAY_BASE = 'https://api.ebay.com';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Auth gate — shared secret between Railway and Vercel
  const proxySecret = process.env.EBAY_PROXY_SECRET;
  if (proxySecret && req.headers['x-proxy-secret'] !== proxySecret) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Determine target eBay path
  const { path } = req.query;
  const ebayPath = Array.isArray(path) ? path[0] : path;
  if (!ebayPath || !ebayPath.startsWith('/')) {
    return res.status(400).json({ error: 'Missing or invalid path parameter' });
  }

  const ebayUrl = `${EBAY_BASE}${ebayPath}`;

  // Forward relevant headers (strip hop-by-hop and proxy headers)
  const forwardHeaders: Record<string, string> = {};
  const allowedHeaders = ['authorization', 'content-type', 'x-ebay-c-marketplace-id', 'accept'];
  for (const key of allowedHeaders) {
    const val = req.headers[key];
    if (val) forwardHeaders[key] = Array.isArray(val) ? val[0] : val;
  }

  try {
    const upstreamRes = await fetch(ebayUrl, {
      method: req.method ?? 'GET',
      headers: forwardHeaders,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? await getRawBody(req) : undefined,
    });

    const contentType = upstreamRes.headers.get('content-type') ?? 'application/json';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.status(upstreamRes.status);

    const body = await upstreamRes.text();
    res.send(body);
  } catch (err: any) {
    console.error('[ebay-proxy] Upstream error:', err.message);
    res.status(502).json({ error: 'eBay proxy upstream error', message: err.message });
  }
}

/** Read the raw request body as a Buffer then convert to string. */
async function getRawBody(req: NextApiRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export const config = {
  api: {
    bodyParser: false, // We read raw body manually to forward as-is
  },
};
