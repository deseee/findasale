/**
 * eBay HTTP / Auth leaf helpers.
 *
 * Phase 1 of the eBay publish self-heal consolidation: pure relocation of the
 * leaf eBay HTTP + OAuth helpers out of ebayController.ts so the publish service
 * (Phase 2) can depend on them without importing the 6,500-line controller.
 *
 * ZERO behavior change — these definitions were moved verbatim from
 * controllers/ebayController.ts. ebayController re-exports getEbayAccessToken and
 * refreshEbayAccessToken so all existing external importers keep working.
 */

import { prisma } from '../lib/prisma';

// ── Vercel Proxy Helpers ────────────────────────────────────────────────────
// Railway DNS cannot resolve api.ebay.com directly, so all eBay API calls route
// through the Vercel proxy at /api/proxy/ebay. These helpers ensure consistent
// URL and header construction across all 35+ call sites.
export const ebayProxyUrl = (path: string): string =>
  `${process.env.FRONTEND_URL ?? 'https://finda.sale'}/api/proxy/ebay?path=${path}`;

export const ebayProxyHeaders = (): Record<string, string> => {
  const secret = process.env.EBAY_PROXY_SECRET;
  return secret ? { 'X-Proxy-Secret': secret } : {};
};

// Token cache for eBay OAuth (simple in-memory, will be replaced with Redis in production)
interface CachedToken {
  token: string;
  expiresAt: number;
}

let ebayTokenCache: CachedToken | null = null;

/**
 * Get or refresh eBay OAuth access token using Client Credentials flow
 */
export async function getEbayAccessToken(): Promise<string | null> {
  try {
    const clientId = process.env.EBAY_CLIENT_ID;
    const clientSecret = process.env.EBAY_CLIENT_SECRET;

    // Mock fallback if credentials not set
    if (!clientId || !clientSecret) {
      console.warn('[eBay] EBAY_CLIENT_ID or EBAY_CLIENT_SECRET not configured');
      return null;
    }

    // Return cached token if still valid
    if (ebayTokenCache && ebayTokenCache.expiresAt > Date.now()) {
      return ebayTokenCache.token;
    }

    // Route through Vercel proxy — Railway's network blocks api.ebay.com at DNS level.
    // Vercel holds its own copy of EBAY_CLIENT_ID/SECRET and fetches the token directly.
    // Railway just asks "give me a token" — no credential forwarding needed.
    // NOTE: Mode 1 uses ?action=token directly; do NOT route through ebayProxyUrl()
    // which prepends ?path= and would corrupt the URL into ?path=?action=token.
    const frontendUrl = process.env.FRONTEND_URL ?? 'https://finda.sale';
    const proxyRes = await fetch(
      `${frontendUrl}/api/proxy/ebay?action=token`,
      {
        method: 'POST',
        headers: ebayProxyHeaders(),
        signal: AbortSignal.timeout(15000), // 15s per-call timeout (Node 20); AbortError caught by surrounding try/catch
      }
    );

    if (!proxyRes.ok) {
      const body = await proxyRes.text().catch(() => '(unreadable)');
      console.error(`[eBay] Token fetch via proxy failed: ${proxyRes.status} — body: ${body.slice(0, 300)}`);
      return null;
    }

    const data = await proxyRes.json() as any;
    if (!data?.access_token) return null;
    const expiresIn = data.expires_in || 7200; // Default 2 hours

    ebayTokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + (expiresIn - 300) * 1000, // Refresh 5 minutes before expiry
    };

    return ebayTokenCache.token;
  } catch (error: any) {
    // Suppress verbose stack for known Railway→eBay network block (ENOTFOUND api.ebay.com).
    // Log a single terse line instead of a full stack trace.
    const isNetworkBlock = error?.cause?.code === 'ENOTFOUND' && error?.cause?.hostname === 'api.ebay.com';
    if (isNetworkBlock) {
      console.warn('[eBay] api.ebay.com unreachable from Railway — eBay sync disabled until proxy routing resolved');
    } else {
      console.error('[eBay] Token fetch error:', error);
    }
    return null;
  }
}

/**
 * Refresh eBay access token if expired
 * Called internally before every eBay API call
 * Exported for use by ebaySoldSyncCron
 */
export async function refreshEbayAccessToken(organizerId: string): Promise<string | null> {
  try {
    const connection = await prisma.ebayConnection.findUnique({
      where: { organizerId },
    });

    if (!connection) {
      console.warn(`[eBay] No connection found for organizer ${organizerId}`);
      return null;
    }

    // Check if token is still valid (more than 5 minutes remaining)
    const now = new Date();
    const expiresIn = (connection.tokenExpiresAt.getTime() - now.getTime()) / 1000;

    if (expiresIn > 300) {
      // Token still valid for at least 5 minutes
      return connection.accessToken;
    }

    // Token expired or expiring soon — refresh it
    const clientId = process.env.EBAY_CLIENT_ID;
    const clientSecret = process.env.EBAY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error('[eBay] EBAY_CLIENT_ID or EBAY_CLIENT_SECRET not configured');
      return null;
    }

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: connection.refreshToken,
    });

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch(
      ebayProxyUrl('/identity/v1/oauth2/token'),
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          ...ebayProxyHeaders(),
        },
        body: params.toString(),
        signal: AbortSignal.timeout(15000), // 15s per-call timeout (Node 20); AbortError caught by surrounding try/catch
      }
    );

    if (!response.ok) {
      const errorMsg = `Token refresh failed: ${response.status}`;
      console.error(`[eBay] ${errorMsg}`);
      await prisma.ebayConnection.update({
        where: { organizerId },
        data: {
          lastErrorAt: new Date(),
          lastErrorMessage: errorMsg,
        },
      });
      return null;
    }

    const data = (await response.json()) as any;
    const newAccessToken = data.access_token;
    const newRefreshToken = data.refresh_token || connection.refreshToken; // Some flows don't return refresh token
    const newExpiresIn = data.expires_in || 7200;
    const newTokenExpiresAt = new Date(Date.now() + newExpiresIn * 1000);

    // Update connection with new tokens
    await prisma.ebayConnection.update({
      where: { organizerId },
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        tokenExpiresAt: newTokenExpiresAt,
        lastRefreshedAt: new Date(),
        lastErrorAt: null,
        lastErrorMessage: null,
      },
    });

    return newAccessToken;
  } catch (error) {
    console.error('[eBay] Token refresh error:', error);
    return null;
  }
}

// ── eBay Notification Public Key Cache ──────────────────────────────────────
// eBay signs Commerce Notification payloads with an ECDSA key identified by a
// `kid` in the x-ebay-signature header. We fetch the matching PEM public key
// (app-scoped) and cache it for 1 hour to avoid a proxy round-trip per event.
interface CachedPublicKey {
  pem: string;
  expiresAt: number;
}

const ebayNotificationKeyCache = new Map<string, CachedPublicKey>();

/**
 * Resolve the eBay notification signing public key (PEM) for a given `kid`.
 * Returns null on any failure — the caller treats null as verification-unavailable.
 * CRITICAL: Railway cannot resolve api.ebay.com — routes through ebayProxyUrl().
 */
export async function getEbayNotificationPublicKey(kid: string): Promise<string | null> {
  try {
    // Return cached PEM if still valid
    const cached = ebayNotificationKeyCache.get(kid);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.pem;
    }

    const appToken = await getEbayAccessToken();
    if (!appToken) {
      console.warn('[eBay Notify] No app access token available for public-key fetch');
      return null;
    }

    const res = await fetch(
      ebayProxyUrl('commerce/notification/v1/public_key/' + encodeURIComponent(kid)),
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${appToken}`,
          ...ebayProxyHeaders(),
        },
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!res.ok) {
      const body = await res.text().catch(() => '(unreadable)');
      console.error(`[eBay Notify] Public-key fetch failed: ${res.status} — body: ${body.slice(0, 300)}`);
      return null;
    }

    const data = (await res.json()) as any;
    const pem = data?.key;
    if (!pem || typeof pem !== 'string') {
      console.error('[eBay Notify] Public-key response missing `key` field');
      return null;
    }

    ebayNotificationKeyCache.set(kid, {
      pem,
      expiresAt: Date.now() + 60 * 60 * 1000, // 1-hour TTL
    });

    return pem;
  } catch (error) {
    console.error('[eBay Notify] Public-key fetch error:', error);
    return null;
  }
}

/**
 * Standard headers for all eBay REST API calls that require a user access token.
 * Accept-Language is required by eBay — omitting it or sending an invalid locale causes 400.
 */
export function ebayUserHeaders(accessToken: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Accept-Language': 'en-US',
    'Content-Language': 'en-US',
  };
}
