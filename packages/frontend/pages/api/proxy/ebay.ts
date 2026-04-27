/**
 * eBay API Proxy — Vercel API Route (DIAGNOSTIC SIMPLIFIED VERSION)
 *
 * Stripped back to plain fetch() with no DNS workarounds and maximum
 * error logging to determine whether Vercel→api.ebay.com actually fails.
 */
import type { NextApiRequest, NextApiResponse } from 'next';

const EBAY_BASE = 'https://api.ebay.com';

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

// Walk err.cause chain and collect every code/message we can find.
function fullErrorTree(err: any): string {
  const parts: string[] = [];
  let current = err;
  let depth = 0;
  while (current && depth < 5) {
    const name = current?.name ?? 'Error';
    const code = current?.code ?? '';
    const msg = (current?.message ?? '').slice(0, 150);
    parts.push(`${name}${code ? `:${code}` : ''}=${msg}`);
    // AggregateError lists multiple causes
    if (Array.isArray(current?.errors)) {
      for (const sub of current.errors.slice(0, 3)) {
        const subCode = sub?.code ?? '';
        const subMsg = (sub?.message ?? '').slice(0, 150);
        parts.push(`  agg[${subCode}]=${subMsg}`);
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
      const ebayRes = await fetch(`${EBAY_BASE}/identity/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
      });
      const text = await ebayRes.text();
      if (!ebayRes.ok) {
        console.error('[ebay-proxy/token] eBay returned', ebayRes.status, text.slice(0, 300));
      }
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', ebayRes.headers.get('content-type') ?? 'application/json');
      return res.status(ebayRes.status).send(text);
    } catch (err: any) {
      const tree = fullErrorTree(err);
      console.error('[ebay-proxy/token] FETCH THREW |', tree);
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
    const upstreamRes = await fetch(`${EBAY_BASE}${ebayPath}`, {
      method: req.method ?? 'GET',
      headers: forwardHeaders,
      body,
    });
    const text = await upstreamRes.text();
    if (!upstreamRes.ok) {
      console.error('[ebay-proxy] Upstream', upstreamRes.status, 'on', ebayPath, '— body:', text.slice(0, 500));
    }
    res.setHeader('Content-Type', upstreamRes.headers.get('content-type') ?? 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(upstreamRes.status).send(text);
  } catch (err: any) {
    const tree = fullErrorTree(err);
    console.error('[ebay-proxy] FETCH THREW on', ebayPath, '|', tree);
    return res.status(502).json({ error: tree });
  }
}
