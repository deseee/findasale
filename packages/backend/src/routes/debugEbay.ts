/**
 * debugEbay.ts — Temporary debug endpoint for diagnosing eBay token refresh 502 errors
 *
 * GET /api/debug/ebay-token-test
 *
 * 1. Fires the exact same POST the cron uses against the Vercel proxy
 *    (https://finda.sale/api/proxy/ebay?path=/identity/v1/oauth2/token)
 *    using client_credentials grant so no per-organizer refresh_token is needed.
 * 2. Returns the raw HTTP status + response body verbatim (no parsing/transformation).
 * 3. Queries EbayConnection for all rows and returns the diagnostic columns.
 *
 * Auth: requires X-Debug-Secret header matching DEBUG_SECRET env var (falls back to
 * EBAY_PROXY_SECRET if DEBUG_SECRET is not set). Delete this file after diagnosis.
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

// Simple secret-header guard — not JWT, intentionally lightweight for a debug endpoint
function requireDebugSecret(req: Request, res: Response, next: () => void) {
  const secret = process.env.DEBUG_SECRET || process.env.EBAY_PROXY_SECRET;
  if (!secret) {
    // No secret configured — allow access (Railway internal network only)
    return next();
  }
  const provided = req.headers['x-debug-secret'];
  if (provided !== secret) {
    return res.status(401).json({ error: 'Missing or invalid X-Debug-Secret header' });
  }
  next();
}

/**
 * GET /api/debug/ebay-token-test
 *
 * Tests the Vercel proxy endpoint that the eBay cron relies on for token refresh,
 * and dumps the current state of all EbayConnection rows.
 */
router.get('/ebay-token-test', requireDebugSecret, async (_req: Request, res: Response) => {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  const proxySecret = process.env.EBAY_PROXY_SECRET;
  const frontendUrl = process.env.FRONTEND_URL ?? 'https://finda.sale';

  // ── 1. Probe the proxy endpoint ──────────────────────────────────────────
  let proxyResult: {
    url: string;
    requestHeaders: Record<string, string>;
    requestBody: string;
    httpStatus: number | null;
    responseBody: string;
    fetchError: string | null;
  };

  const proxyUrl = `${frontendUrl}/api/proxy/ebay?path=/identity/v1/oauth2/token`;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  if (proxySecret) {
    requestHeaders['X-Proxy-Secret'] = proxySecret;
  }

  if (clientId && clientSecret) {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    requestHeaders['Authorization'] = `Basic ${credentials}`;
  } else {
    requestHeaders['Authorization'] = 'Basic <MISSING — EBAY_CLIENT_ID or EBAY_CLIENT_SECRET not set>';
  }

  const requestBody = 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope';

  try {
    const proxyRes = await fetch(proxyUrl, {
      method: 'POST',
      headers: requestHeaders,
      body: requestBody,
    });

    const rawBody = await proxyRes.text();

    proxyResult = {
      url: proxyUrl,
      requestHeaders: {
        ...requestHeaders,
        // Redact the actual credential value in the response for safety
        ...(requestHeaders['Authorization']?.startsWith('Basic ') && clientId && clientSecret
          ? { Authorization: `Basic <redacted — ${clientId.substring(0, 6)}...>` }
          : {}),
      },
      requestBody,
      httpStatus: proxyRes.status,
      responseBody: rawBody,
      fetchError: null,
    };
  } catch (err: any) {
    proxyResult = {
      url: proxyUrl,
      requestHeaders: {
        ...requestHeaders,
        ...(requestHeaders['Authorization']?.startsWith('Basic ') && clientId && clientSecret
          ? { Authorization: `Basic <redacted — ${clientId.substring(0, 6)}...>` }
          : {}),
      },
      requestBody,
      httpStatus: null,
      responseBody: '',
      fetchError: err?.message ?? String(err),
    };
  }

  // ── 2. Query EbayConnection table ────────────────────────────────────────
  let ebayConnections: object[] = [];
  let dbError: string | null = null;

  try {
    ebayConnections = await prisma.ebayConnection.findMany({
      select: {
        organizerId: true,
        ebayUserId: true,
        connectedAt: true,
        lastRefreshedAt: true,
        lastEbaySoldSyncAt: true,
        lastErrorAt: true,
        lastErrorMessage: true,
        tokenExpiresAt: true,
      },
      orderBy: { connectedAt: 'desc' },
    });
  } catch (err: any) {
    dbError = err?.message ?? String(err);
  }

  // ── 3. Return combined diagnostic payload ────────────────────────────────
  return res.status(200).json({
    _note: 'DELETE this endpoint after diagnosis — packages/backend/src/routes/debugEbay.ts',
    env: {
      FRONTEND_URL: frontendUrl,
      EBAY_CLIENT_ID: clientId ? `${clientId.substring(0, 6)}... (set)` : 'NOT SET',
      EBAY_CLIENT_SECRET: clientSecret ? '<set>' : 'NOT SET',
      EBAY_PROXY_SECRET: proxySecret ? '<set>' : 'NOT SET',
    },
    proxyProbe: proxyResult,
    ebayConnections: dbError ? { error: dbError } : ebayConnections,
  });
});

export default router;
