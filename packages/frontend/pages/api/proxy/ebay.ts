/**
 * eBay API Proxy — Vercel API Route
 *
 * Two modes:
 *
 * 1. Token mode (POST /api/proxy/ebay?action=token)
 *    Vercel uses its own EBAY_CLIENT_ID/SECRET to get a token from eBay.
 *    Railway never needs to reach api.ebay.com for auth.
 *
 * 2. General proxy mode (any method /api/proxy/ebay?path=/some/ebay/path)
 *    Forwards headers + raw body bytes from Railway to api.ebay.com unchanged.
 *    Railway passes the Bearer token it got from action=token.
 *
 * Security: requests must include X-Proxy-Secret matching EBAY_PROXY_SECRET env var.
 * Set EBAY_PROXY_SECRET in both Vercel and Railway environment variables.
 *
 * Vercel also needs: EBAY_CLIENT_ID, EBAY_CLIENT_SECRET (copy from Railway).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import dns from 'node:dns';

const EBAY_BASE = 'https://api.ebay.com';

// Force IPv4-first DNS resolution for outbound fetch() calls in this function.
// undici (Node 22's built-in fetch) was failing with TypeError/cause=ENOTFOUND
// when looking up api.ebay.com from Vercel — the IPv6 path was either missing
// or unreachable. setDefaultResultOrder('ipv4first') makes the resolver return
// IPv4 addresses first, which undici then prefers.
// Runs once per cold start (module load).
dns.setDefaultResultOrder('ipv4first');

// Disable Next.js body parsing — we forward the raw body for Mode 2 so that
// application/x-www-form-urlencoded bodies (eBay token refresh) survive intact.
// Auto-parsing then JSON.stringify-ing them mangled the form body into JSON
// while leaving the Content-Type form-encoded — eBay rejected → fetch threw → 502.
export const config = {
  api: {
    bodyParser: false,
  },
};

// Returns a UTF-8 string. Every eBay endpoint we proxy uses text bodies
// (JSON or application/x-www-form-urlencoded), so string is the right shape
// and is unconditionally a valid fetch BodyInit (avoids the
// Uint8Array<ArrayBufferLike> vs. Uint8Array<ArrayBuffer> Node 22 type mismatch).
async function readRawBody(req: NextApiRequest): Promise<string | undefined> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) return undefined;
  return Buffer.concat(chunks).toString('utf-8');
}

// Pack diagnostic fields into a short, single-line prefix so Vercel's runtime
// log table doesn't truncate the actual root cause (ENOTFOUND, AbortError, etc.).
function describeError(err: any): string {
  const code = err?.code ?? '';
  const name = err?.name ?? 'Error';
  const cause = err?.cause?.code ?? err?.cause?.message ?? '';
  const msg = (err?.message ?? '').slice(0, 200);
  return `[${name}${code ? `:${code}` : ''}${cause ? `/cause=${cause}` : ''}] ${msg}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Auth gate
  const proxySecret = process.env.EBAY_PROXY_SECRET;
  if (proxySecret && req.headers['x-proxy-secret'] !== proxySecret) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { action, path } = req.query;

  // ── Mode 1: Token (Vercel fetches with its own credentials) ─────────────
  if (action === 'token') {
    const clientId = process.env.EBAY_CLIENT_ID;
    const clientSecret = process.env.EBAY_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.status(500).json({ error: 'eBay credentials not configured in Vercel env' });
    }

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    try {
      const ebayRes = await fetch(`${EBAY_BASE}/identity/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
      });

      const data = await ebayRes.json();
      if (!ebayRes.ok) {
        console.error('[ebay-proxy/token] eBay returned', ebayRes.status, JSON.stringify(data));
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.status(ebayRes.status).json(data);
    } catch (err: any) {
      console.error('[ebay-proxy/token] threw', describeError(err));
      return res.status(502).json({ error: describeError(err) });
    }
  }

  // ── Mode 2: General proxy ─────────────────────────────────────────────────
  const ebayPath = Array.isArray(path) ? path[0] : path;
  if (!ebayPath || !ebayPath.startsWith('/')) {
    return res.status(400).json({ error: 'Missing or invalid path parameter' });
  }

  const forwardHeaders: Record<string, string> = {};
  const allowedHeaders = ['authorization', 'content-type', 'x-ebay-c-marketplace-id', 'accept'];
  for (const key of allowedHeaders) {
    const val = req.headers[key];
    if (val) forwardHeaders[key] = Array.isArray(val) ? val[0] : val;
  }

  // Forward the raw body unchanged. Never JSON.stringify a form-encoded body.
  const body = req.method !== 'GET' && req.method !== 'HEAD'
    ? await readRawBody(req)
    : undefined;

  try {
    const upstreamRes = await fetch(`${EBAY_BASE}${ebayPath}`, {
      method: req.method ?? 'GET',
      headers: forwardHeaders,
      body,
    });

    const text = await upstreamRes.text();
    if (!upstreamRes.ok) {
      console.error(
        '[ebay-proxy] Upstream',
        upstreamRes.status,
        'on',
        ebayPath,
        '— body:',
        text.slice(0, 500),
      );
    }
    res.setHeader('Content-Type', upstreamRes.headers.get('content-type') ?? 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(upstreamRes.status).send(text);
  } catch (err: any) {
    console.error('[ebay-proxy] threw on', ebayPath, describeError(err));
    return res.status(502).json({ error: describeError(err) });
  }
}
