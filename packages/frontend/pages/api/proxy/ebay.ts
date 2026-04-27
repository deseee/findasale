/**
 * eBay API Proxy — Vercel API Route
 *
 * Two modes:
 *   1. Token (POST /api/proxy/ebay?action=token) — Vercel uses its own creds
 *   2. General (any method, /api/proxy/ebay?path=/...) — forwards to api.ebay.com
 *
 * Security: requests must include X-Proxy-Secret matching EBAY_PROXY_SECRET.
 *
 * Why this is so much code: api.ebay.com → CNAME → e333426.a.akamaiedge.net,
 * and Akamai's authoritative DNS returns A records ONLY when the resolver
 * sends EDNS Client Subnet. Vercel's/serverless resolvers don't send ECS, so
 * fetch('https://api.ebay.com/...') fails with ENOTFOUND. We resolve via
 * Google's DoH endpoint with explicit ECS, then issue the request via
 * node:https against the resolved Akamai IP, preserving Host header + TLS SNI
 * so eBay's cert still validates.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import https from 'node:https';

const EBAY_HOST = 'api.ebay.com';

// Resolve api.ebay.com via DoH with EDNS Client Subnet. Returns ALL A records
// from the CNAME chain so the caller can fail over.
async function resolveEbayIps(): Promise<string[]> {
  const url =
    `https://dns.google/resolve?name=${EBAY_HOST}&type=A&edns_client_subnet=8.8.8.0/24`;
  const res = await fetch(url, { headers: { Accept: 'application/dns-json' } });
  if (!res.ok) {
    throw new Error(`DoH HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    Status: number;
    Answer?: Array<{ type: number; data: string; TTL: number }>;
  };
  if (data.Status !== 0) {
    throw new Error(`DoH status ${data.Status}`);
  }
  // Filter type 1 = A records. The chain (api.ebay.com → CNAMEs → Akamai)
  // produces multiple type-5 entries followed by type-1 entries.
  const ips = (data.Answer ?? []).filter((a) => a.type === 1).map((a) => a.data);
  if (!ips.length) {
    throw new Error(`DoH returned no A records (even with ECS) for ${EBAY_HOST}`);
  }
  return ips;
}

// Cache resolved IPs for 60 seconds (Akamai TTLs are typically 20s; 60s
// gives a small batching window per warm function instance).
let cachedIps: { ips: string[]; expires: number } | null = null;

async function getEbayIps(): Promise<string[]> {
  if (cachedIps && cachedIps.expires > Date.now()) return cachedIps.ips;
  const ips = await resolveEbayIps();
  cachedIps = { ips, expires: Date.now() + 60 * 1000 };
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
        servername: EBAY_HOST, // TLS SNI — eBay's cert is for api.ebay.com
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

// Try each resolved IP in turn. If all fail, invalidate cache and rethrow.
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
  cachedIps = null; // force re-resolve next time
  throw lastErr ?? new Error('No IPs to try');
}

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

function fullErrorTree(err: any): string {
  const parts: string[] = [];
  let current = err;
  let depth = 0;
  while (current && depth < 5) {
    const name = current?.name ?? 'Error';
    const code = current?.code ?? '';
    const msg = (current?.message ?? '').slice(0, 150);
    parts.push(`${name}${code ? `:${code}` : ''}=${msg}`);
    if (Array.isArray(current?.errors)) {
      for (const sub of current.errors.slice(0, 3)) {
        parts.push(`  agg[${sub?.code ?? ''}]=${(sub?.message ?? '').slice(0, 150)}`);
      }
    }
    current = current?.cause;
    depth++;
  }
  return parts.join(' | ');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const proxySecret = process.env.EBAY_PROXY_SECRET;
  if (proxySecret && req.headers['x-proxy-secret'] !== proxySecret) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { action, path } = req.query;

  // ── Mode 1: Token ──────────────────────────────────────────────────────
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
      const tree = fullErrorTree(err);
      console.error('[ebay-proxy/token] threw |', tree);
      return res.status(502).json({ error: tree });
    }
  }

  // ── Mode 2: General proxy ───────────────────────────────────────────────
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
      console.error('[ebay-proxy] Upstream', result.status, 'on', ebayPath, '— body:', result.body.slice(0, 500));
    }
    res.setHeader('Content-Type', result.contentType ?? 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(result.status).send(result.body);
  } catch (err: any) {
    const tree = fullErrorTree(err);
    console.error('[ebay-proxy] threw on', ebayPath, '|', tree);
    return res.status(502).json({ error: tree });
  }
}
