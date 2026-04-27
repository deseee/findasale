/**
 * eBay API Proxy — Vercel API Route
 *
 * Two modes:
 *
 * 1. Token mode (POST /api/proxy/ebay?action=token)
 *    Vercel uses its own EBAY_CLIENT_ID/SECRET to get a token from eBay.
 *
 * 2. General proxy mode (any method /api/proxy/ebay?path=/some/ebay/path)
 *    Forwards headers + raw body bytes from Railway to api.ebay.com unchanged.
 *
 * Security: requests must include X-Proxy-Secret matching EBAY_PROXY_SECRET env var.
 *
 * Networking: Vercel's default OS resolver fails with ENOTFOUND on api.ebay.com.
 * Custom Resolver bound to 8.8.8.8 over UDP returned empty arrays intermittently —
 * Vercel functions appear to block or unreliably handle outbound UDP port 53.
 * Solution: resolve via Cloudflare DNS-over-HTTPS (HTTPS, not UDP), then issue
 * the eBay request via node:https.request with the resolved IPv4 address,
 * preserving Host header + TLS SNI so eBay's cert validates.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import https from 'node:https';

const EBAY_HOST = 'api.ebay.com';

interface DohAnswer {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

interface DohResponse {
  Status: number;
  Answer?: DohAnswer[];
}

// Resolve api.ebay.com via Cloudflare DNS-over-HTTPS. Returns ALL A records
// so the caller can fail over if the first IP is unreachable.
async function resolveEbayIps(): Promise<string[]> {
  const url = `https://1.1.1.1/dns-query?name=${EBAY_HOST}&type=A`;
  const res = await fetch(url, {
    headers: { Accept: 'application/dns-json' },
  });
  if (!res.ok) {
    throw new Error(`DoH lookup HTTP ${res.status}`);
  }
  const data = (await res.json()) as DohResponse;
  if (data.Status !== 0) {
    throw new Error(`DoH lookup status ${data.Status}`);
  }
  // type 1 = A record. Cloudflare may return CNAMEs (type 5) interleaved.
  const ips = (data.Answer ?? []).filter((a) => a.type === 1).map((a) => a.data);
  if (!ips.length) {
    throw new Error(`DoH returned no A records for ${EBAY_HOST}`);
  }
  return ips;
}

// Cache resolved IPs for 5 minutes per warm function instance.
let cachedIps: { ips: string[]; expires: number } | null = null;

async function getEbayIps(): Promise<string[]> {
  if (cachedIps && cachedIps.expires > Date.now()) return cachedIps.ips;
  const ips = await resolveEbayIps();
  cachedIps = { ips, expires: Date.now() + 5 * 60 * 1000 };
  return ips;
}

interface HttpsResult {
  status: number;
  body: string;
  contentType: string | null;
}

function requestEbayOnce(
  ip: string,
  ebayPath: string,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
): Promise<HttpsResult> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: ip,
        port: 443,
        path: ebayPath,
        method,
        headers: { ...headers, host: EBAY_HOST },
        servername: EBAY_HOST, // TLS SNI
        family: 4,
        timeout: 15000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf-8'),
            contentType: (res.headers['content-type'] as string) ?? null,
          });
        });
        res.on('error', reject);
      },
    );
    req.on('timeout', () => {
      req.destroy(new Error('Request timeout'));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// Try each resolved IP in turn until one works. If all fail, rethrow the last error.
async function fetchEbay(
  ebayPath: string,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
): Promise<HttpsResult> {
  const ips = await getEbayIps();
  let lastErr: any;
  for (const ip of ips) {
    try {
      return await requestEbayOnce(ip, ebayPath, method, headers, body);
    } catch (err) {
      lastErr = err;
    }
  }
  // All IPs failed — invalidate cache so next call re-resolves
  cachedIps = null;
  throw lastErr ?? new Error('No IPs to try');
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
  const allowedHeaders = [
    'authorization',
    'content-type',
    'x-ebay-c-marketplace-id',
    'accept',
    'x-ebay-api-call-name',
    'x-ebay-api-siteid',
    'x-ebay-api-compatibility-level',
    'x-ebay-api-app-name',
    'x-ebay-api-iaf-token',
  ];
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
