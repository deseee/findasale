/**
 * eBay API Proxy — Vercel API Route
 *
 * Resolves api.ebay.com via Google DoH (with EDNS Client Subnet, required by
 * eBay's Akamai-hosted DNS), then forwards via node:https with explicit
 * Host header + TLS SNI so eBay's cert validates.
 *
 * Why the explicit User-Agent / Accept / Content-Length headers below:
 * Akamai-fronted APIs commonly return 504 (gateway timeout) for requests that
 * arrive without baseline browser-like headers, instead of forwarding them to
 * origin. node:https doesn't add any of those by default.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import https from 'node:https';

const EBAY_HOST = 'api.ebay.com';
const PROXY_UA = 'FindASale-Backend/1.0 (+https://finda.sale)';

async function resolveEbayIps(): Promise<string[]> {
  const url =
    `https://dns.google/resolve?name=${EBAY_HOST}&type=A&edns_client_subnet=8.8.8.0/24`;
  const res = await fetch(url, { headers: { Accept: 'application/dns-json' } });
  if (!res.ok) throw new Error(`DoH HTTP ${res.status}`);
  const data = (await res.json()) as {
    Status: number;
    Answer?: Array<{ type: number; data: string; TTL: number }>;
  };
  if (data.Status !== 0) throw new Error(`DoH status ${data.Status}`);
  const ips = (data.Answer ?? []).filter((a) => a.type === 1).map((a) => a.data);
  if (!ips.length) throw new Error(`DoH returned no A records for ${EBAY_HOST}`);
  return ips;
}

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
    // Baseline headers many edge/WAF stacks expect. Caller-supplied headers
    // override these (e.g. Authorization, Content-Type from the original req).
    const finalHeaders: Record<string, string> = {
      'user-agent': PROXY_UA,
      accept: '*/*',
      'accept-encoding': 'identity', // disable response compression — keeps body parsing simple
      connection: 'close',
      ...headers,
      host: EBAY_HOST,
    };
    if (body !== undefined) {
      finalHeaders['content-length'] = String(Buffer.byteLength(body, 'utf-8'));
    }

    const req = https.request(
      {
        host: ip,
        port: 443,
        path: ebayPath,
        method,
        headers: finalHeaders,
        servername: EBAY_HOST,
        family: 4,
        timeout: 25000,
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
    req.on('timeout', () => req.destroy(new Error('Request timeout after 25s')));
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

async function fetchEbay(
  ebayPath: string,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
): Promise<HttpsResult & { ip: string }> {
  const ips = await getEbayIps();
  let lastErr: any;
  for (const ip of ips) {
    try {
      const result = await requestEbayOnce(ip, ebayPath, method, headers, body);
      return { ...result, ip };
    } catch (err) {
      lastErr = err;
    }
  }
  cachedIps = null;
  throw lastErr ?? new Error('No IPs to try');
}

export const config = { api: { bodyParser: false } };

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
        console.error('[ebay-proxy/token] eBay returned', result.status, 'via', result.ip, 'body:', result.body.slice(0, 300));
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
        '[ebay-proxy] Upstream', result.status, 'on', ebayPath,
        'via', result.ip, '— body:', result.body.slice(0, 500),
      );
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
