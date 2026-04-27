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
 *
 * Networking: Vercel's default resolver fails with ENOTFOUND on api.ebay.com
 * (confirmed via debug logs S590). We bypass it by:
 *   1. Resolving api.ebay.com via Google DNS (8.8.8.8) directly
 *   2. Calling node:https.request with the resolved IPv4 address
 *   3. Preserving Host header + setting servername for TLS SNI
 * This avoids both undici's DNS handling and the OS getaddrinfo path.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import https from 'node:https';
import { Resolver } from 'node:dns/promises';

const EBAY_HOST = 'api.ebay.com';

// Cached resolver bound to Google DNS so we don't depend on Vercel's resolver.
const ebayResolver = new Resolver();
ebayResolver.setServers(['8.8.8.8', '8.8.4.4']);

// Cache the resolved IP for 5 minutes to avoid a DNS hit per request.
let cachedIp: { ip: string; expires: number } | null = null;

async function resolveEbayIp(): Promise<string> {
  if (cachedIp && cachedIp.expires > Date.now()) return cachedIp.ip;
  const addresses = await ebayResolver.resolve4(EBAY_HOST);
  if (!addresses.length) throw new Error(`No A records for ${EBAY_HOST}`);
  cachedIp = { ip: addresses[0], expires: Date.now() + 5 * 60 * 1000 };
  return addresses[0];
}

interface HttpsResult {
  status: number;
  body: string;
  contentType: string | null;
}

async function fetchEbay(
  ebayPath: string,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
): Promise<HttpsResult> {
  const ip = await resolveEbayIp();
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: ip,
        port: 443,
        path: ebayPath,
        method,
        headers: { ...headers, host: EBAY_HOST },
        servername: EBAY_HOST, // TLS SNI — eBay's cert is for api.ebay.com
        family: 4,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8');
          resolve({
            status: res.statusCode ?? 0,
            body: text,
            contentType: (res.headers['content-type'] as string) ?? null,
          });
        });
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// Disable Next.js body parsing — we forward the raw body for Mode 2 so that
// application/x-www-form-urlencoded bodies (eBay token refresh) survive intact.
export const config = {
  api: {
    bodyParser: false,
  },
};

async function readRawBody(req: NextApiRequest): Promise<string | undefined> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) return undefined;
  return Buffer.concat(chunks).toString('utf-8');
}

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
      const result = await fetchEbay(
        '/identity/v1/oauth2/token',
        'POST',
        {
          authorization: `Basic ${credentials}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
      );

      if (result.status >= 400) {
        console.error('[ebay-proxy/token] eBay returned', result.status, result.body.slice(0, 300));
      }
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', result.contentType ?? 'application/json');
      return res.status(result.status).send(result.body);
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

  const body = req.method !== 'GET' && req.method !== 'HEAD'
    ? await readRawBody(req)
    : undefined;

  try {
    const result = await fetchEbay(ebayPath, req.method ?? 'GET', forwardHeaders, body);

    if (result.status >= 400) {
      console.error(
        '[ebay-proxy] Upstream',
        result.status,
        'on',
        ebayPath,
        '— body:',
        result.body.slice(0, 500),
      );
    }
    res.setHeader('Content-Type', result.contentType ?? 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(result.status).send(result.body);
  } catch (err: any) {
    console.error('[ebay-proxy] threw on', ebayPath, describeError(err));
    return res.status(502).json({ error: describeError(err) });
  }
}
