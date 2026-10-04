/**
 * etsyAuth.ts -- Etsy OAuth connect/callback logic, token storage, single-flight refresh,
 * disconnect and shop setup (ADR-135 D1, D2.2). Batch B1.
 *
 * Follows reverbConnector.ts's pattern: MarketplaceAccount (platform 'ETSY') holds the tokens,
 * encrypted with utils/tokenCrypto (enc:v1:), and this file is the sole reader/writer of those
 * columns for ETSY. Decrypted tokens are handed to etsyHttp per call and never logged, returned to
 * the client or placed in Sentry.
 *
 * Token lifecycle (Etsy authentication doc, fetched 2026-10-03,
 * https://developers.etsy.com/documentation/essentials/authentication): access token 1 hour,
 * refresh token 90 days, a refresh returns a new refresh token, no client_secret on token calls,
 * access tokens look like `<numeric user id>.<token>`. No revoke endpoint is documented.
 * UNVERIFIED (live test T3): whether the old refresh token stays valid after a refresh, whether the
 * 90-day window resets on refresh (refreshTokenExpiresAt is therefore a conservative estimate: token
 * response time + 90 days), the scope field of the token response, and the token host.
 *
 * Single-flight refresh: MarketplaceAccount.refreshLeaseUntil is a 30 second lease taken with one
 * conditional updateMany. The winner calls the token endpoint and writes both new tokens in ONE
 * update; losers poll the row every 250 ms for up to 8 s and then fail retryably (ETSY_REFRESH_BUSY).
 *   - invalid_grant (HTTP 400) or HTTP 401 on refresh: status NEEDS_REAUTH, later calls short-circuit
 *     with ETSY_NEEDS_REAUTH and no network.
 *   - network, 5xx or any other failure: status stays ACTIVE, lease released, retried on the next call.
 *
 * Import safety: no env reads or network at module load; env, db, clock, sleep, crypto and the HTTP
 * door are injectable through the deps argument.
 */

import {
  EtsyError,
  captureEtsyEvent,
  scrubEtsySecrets,
  ETSY_STATE_ID,
} from './etsyBudget';
import type { EtsyEnv, EtsyPriority } from './etsyBudget';
import { etsyRequest, etsyTokenRequest, isEtsyConnectorEnabled, isEtsyPushEnabled, summarizeEtsyError } from './etsyHttp';
import type { EtsyHttpDeps, EtsyRequestOptions, EtsyResponse } from './etsyHttp';
import {
  ETSY_SCOPES,
  ETSY_SCOPE_STRING,
  buildEtsyAuthorizeUrl,
  consumeEtsyOAuthState,
  createEtsyOAuthState,
  loadEtsyTokenCrypto,
} from './etsyOAuthState';
import type { EtsyTokenCrypto } from './etsyOAuthState';

/** Refresh when fewer than 5 minutes of access-token life remain (mirrors refreshEbayAccessToken). */
export const ETSY_REFRESH_EARLY_MS = 5 * 60 * 1000;
export const ETSY_REFRESH_LEASE_MS = 30 * 1000;
export const ETSY_REFRESH_POLL_MS = 250;
export const ETSY_REFRESH_POLL_MAX_MS = 8 * 1000;
/** Conservative refresh-token lifetime estimate (documented 90 days). */
export const ETSY_REFRESH_TOKEN_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;
export const ETSY_REFRESH_SOON_MS = 14 * 24 * 60 * 60 * 1000;

export const ETSY_ATTRIBUTION =
  "The term 'Etsy' is a trademark of Etsy, Inc. This Application uses Etsy's API, but is not endorsed or certified by Etsy.";

type EtsyDb = any;

export interface EtsyAuthDeps {
  /** Prisma-shaped client. Defaults to the shared client, loaded lazily. */
  db?: EtsyDb;
  env?: EtsyEnv;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  crypto?: EtsyTokenCrypto;
  /** Token endpoint call. Defaults to etsyTokenRequest through the one door. */
  tokenRequest?: (
    params: Record<string, string>,
    opts?: { priority?: EtsyPriority; organizerId?: string }
  ) => Promise<EtsyResponse>;
  /** API call. Defaults to etsyRequest through the one door. */
  request?: (opts: EtsyRequestOptions) => Promise<EtsyResponse>;
  /** Passed to the default etsyRequest / etsyTokenRequest (fetch, budget, gate, clock). */
  http?: EtsyHttpDeps;
}

function getDb(deps: EtsyAuthDeps): EtsyDb {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return deps.db ?? require('../../lib/prisma').prisma;
}
const getEnv = (deps: EtsyAuthDeps): EtsyEnv => deps.env ?? process.env;
const getNow = (deps: EtsyAuthDeps): Date => (deps.now ?? (() => new Date()))();
const getSleep = (deps: EtsyAuthDeps) => deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

function tokenRequestFn(deps: EtsyAuthDeps) {
  return (
    deps.tokenRequest ??
    ((params: Record<string, string>, opts?: { priority?: EtsyPriority; organizerId?: string }) =>
      etsyTokenRequest(params, { env: getEnv(deps), now: deps.now, sleep: deps.sleep, ...(deps.http ?? {}) }, opts))
  );
}
function requestFn(deps: EtsyAuthDeps) {
  return (
    deps.request ??
    ((opts: EtsyRequestOptions) => etsyRequest(opts, { env: getEnv(deps), now: deps.now, sleep: deps.sleep, ...(deps.http ?? {}) }))
  );
}

// ---------------------------------------------------------------------------------------------
// Tier gate and redirect URI
// ---------------------------------------------------------------------------------------------

export function parseAllowedOrganizerIds(env: EtsyEnv): string[] {
  return String(env.ETSY_ALLOWED_ORGANIZER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 'commercial' only when set to exactly that; any other value (including unset) is 'personal' (fail closed). */
export function getEtsyAccessTier(env: EtsyEnv): 'personal' | 'commercial' {
  return String(env.ETSY_ACCESS_TIER ?? '').trim().toLowerCase() === 'commercial' ? 'commercial' : 'personal';
}

/** Under 'personal' only organizers listed in ETSY_ALLOWED_ORGANIZER_IDS may connect; under 'commercial' the list is ignored. */
export function isOrganizerAllowedForEtsy(organizerId: string, env: EtsyEnv): boolean {
  if (getEtsyAccessTier(env) === 'commercial') return true;
  return parseAllowedOrganizerIds(env).includes(organizerId);
}

/** Server-built redirect URI. The client never supplies it. Must match the portal registration exactly. */
export function buildEtsyRedirectUri(env: EtsyEnv): string {
  const override = (env.ETSY_REDIRECT_URI ?? '').trim();
  if (override) return override;
  const base = (env.FRONTEND_URL ?? '').trim() || 'https://finda.sale';
  return `${base.replace(/\/+$/, '')}/organizer/etsy-oauth-callback`;
}

export function assertEtsyConnectAllowed(organizerId: string, env: EtsyEnv): void {
  if (!isEtsyConnectorEnabled(env)) throw new EtsyError('ETSY_DISABLED', 'The Etsy connector is switched off');
  if (!isOrganizerAllowedForEtsy(organizerId, env)) {
    throw new EtsyError('ETSY_NOT_ALLOWED', 'This organizer is not on the Etsy allowlist');
  }
  if (!(env.ETSY_API_KEY ?? '').trim()) throw new EtsyError('ETSY_NOT_CONFIGURED', 'ETSY_API_KEY is not set');
}

// ---------------------------------------------------------------------------------------------
// Connect (GET /connect) and callback (POST /callback)
// ---------------------------------------------------------------------------------------------

/** Create a state row and return the Etsy authorize URL for the browser to open. */
export async function startEtsyConnect(
  args: { organizerId: string; userId: string },
  deps: EtsyAuthDeps = {}
): Promise<{ authorizeUrl: string }> {
  const env = getEnv(deps);
  assertEtsyConnectAllowed(args.organizerId, env);
  const crypt = deps.crypto ?? loadEtsyTokenCrypto(); // fails closed (ETSY_NOT_CONFIGURED) when the key is missing
  const created = await createEtsyOAuthState(
    { organizerId: args.organizerId, userId: args.userId },
    { db: getDb(deps), crypto: crypt, now: deps.now }
  );
  const authorizeUrl = buildEtsyAuthorizeUrl({
    clientId: (env.ETSY_API_KEY ?? '').trim(),
    redirectUri: buildEtsyRedirectUri(env),
    scope: created.requestedScopes,
    state: created.state,
    codeChallenge: created.codeChallenge,
  });
  return { authorizeUrl };
}

interface EtsyTokenPayload {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  scope: string | null;
}

function parseTokenPayload(data: any): EtsyTokenPayload | null {
  if (!data || typeof data.access_token !== 'string' || typeof data.refresh_token !== 'string') return null;
  const expiresIn = Number(data.expires_in);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) return null;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresInSeconds: expiresIn,
    scope: typeof data.scope === 'string' && data.scope.trim() ? data.scope.trim() : null,
  };
}

/** Access tokens look like `<numeric etsy user id>.<token>`; the prefix is the Etsy user id. */
export function etsyUserIdFromAccessToken(accessToken: string): string | null {
  const m = /^(\d+)\./.exec(accessToken);
  return m ? m[1] : null;
}

export interface EtsyShopIdentity {
  shopId: string;
  shopName: string | null;
  shopCurrency: string | null;
}

/**
 * getShopByOwnerUserId: GET /v3/application/users/{user_id}/shops returns one Shop with shop_id,
 * shop_name and currency_code (OpenAPI spec 3.0.0, public, no scope). Returns null when the user has no shop.
 */
export async function resolveEtsyShop(
  etsyUserId: string,
  organizerId: string,
  deps: EtsyAuthDeps = {}
): Promise<EtsyShopIdentity | null> {
  const res = await requestFn(deps)({
    method: 'GET',
    path: `/v3/application/users/${encodeURIComponent(etsyUserId)}/shops`,
    priority: 'URGENT',
    organizerId,
    endpointClass: 'public',
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new EtsyError('ETSY_UPSTREAM', `Etsy shop lookup failed with HTTP ${res.status}`, { status: res.status });
  const shop = res.data && res.data.shop_id !== undefined ? res.data : Array.isArray(res.data?.results) ? res.data.results[0] : null;
  if (!shop || shop.shop_id === undefined || shop.shop_id === null) return null;
  return {
    shopId: String(shop.shop_id),
    shopName: typeof shop.shop_name === 'string' ? shop.shop_name : null,
    shopCurrency: typeof shop.currency_code === 'string' ? shop.currency_code : null,
  };
}

export interface CompletedEtsyConnect {
  shopId: string;
  shopName: string | null;
  shopCurrency: string | null;
  grantedScopes: string;
}

/**
 * Finish the OAuth flow: consume the single-use state (bound to organizer and user), exchange the
 * code with the stored PKCE verifier, resolve the shop and upsert MarketplaceAccount plus
 * EtsyShopSettings. Every failure of the state or the exchange surfaces as the same generic error.
 */
export async function completeEtsyConnect(
  args: { organizerId: string; userId: string; code: unknown; state: unknown },
  deps: EtsyAuthDeps = {}
): Promise<CompletedEtsyConnect> {
  const env = getEnv(deps);
  const db = getDb(deps);
  assertEtsyConnectAllowed(args.organizerId, env);
  const crypt = deps.crypto ?? loadEtsyTokenCrypto();

  if (typeof args.code !== 'string' || args.code.length < 8 || args.code.length > 2048) {
    throw new EtsyError('ETSY_STATE_INVALID', 'Invalid Etsy authorization response');
  }
  const consumed = await consumeEtsyOAuthState(
    { state: args.state, organizerId: args.organizerId, userId: args.userId },
    { db, crypto: crypt, now: deps.now }
  );
  if (!consumed) throw new EtsyError('ETSY_STATE_INVALID', 'Invalid Etsy authorization response');

  const tokenRes = await tokenRequestFn(deps)(
    {
      grant_type: 'authorization_code',
      client_id: (env.ETSY_API_KEY ?? '').trim(),
      redirect_uri: buildEtsyRedirectUri(env),
      code: args.code,
      code_verifier: consumed.codeVerifier,
    },
    { priority: 'URGENT', organizerId: args.organizerId }
  );
  const tokens = tokenRes.ok ? parseTokenPayload(tokenRes.data) : null;
  const etsyUserId = tokens ? etsyUserIdFromAccessToken(tokens.accessToken) : null;
  if (!tokens || !etsyUserId) {
    const summary = summarizeEtsyError(tokenRes, env);
    captureEtsyEvent('warning', 'Etsy token exchange failed', {
      area: 'auth',
      step: 'callback-exchange',
      extra: { organizerId: args.organizerId, status: tokenRes.status, etsyError: summary.code },
    }, env);
    throw new EtsyError('ETSY_TOKEN_EXCHANGE_FAILED', 'Etsy token exchange failed', { status: tokenRes.status });
  }

  const shop = await resolveEtsyShop(etsyUserId, args.organizerId, deps);
  if (!shop) throw new EtsyError('ETSY_NO_SHOP', 'No Etsy shop found for this Etsy account');

  const otherOwner = await db.etsyShopSettings.findFirst({
    where: { shopId: shop.shopId, organizerId: { not: args.organizerId } },
    select: { id: true },
  });
  if (otherOwner) throw new EtsyError('ETSY_SHOP_IN_USE', 'This Etsy shop is already connected to another account');

  const now = getNow(deps);
  const grantedScopes = tokens.scope ?? consumed.requestedScopes ?? ETSY_SCOPE_STRING;
  const data = {
    status: 'ACTIVE',
    accessToken: crypt.encrypt(tokens.accessToken),
    refreshToken: crypt.encrypt(tokens.refreshToken),
    tokenExpiresAt: new Date(now.getTime() + tokens.expiresInSeconds * 1000),
    refreshTokenExpiresAt: new Date(now.getTime() + ETSY_REFRESH_TOKEN_LIFETIME_MS),
    externalUserId: etsyUserId,
    externalShopId: shop.shopId,
    grantedScopes,
    lastRefreshedAt: now,
    lastErrorAt: null,
    lastErrorMessage: null,
    refreshLeaseUntil: null,
  };
  const account = await db.marketplaceAccount.upsert({
    where: { organizerId_platform: { organizerId: args.organizerId, platform: 'ETSY' } },
    create: { organizerId: args.organizerId, platform: 'ETSY', connectedAt: now, ...data },
    update: data,
  });

  const existing = await db.etsyShopSettings.findUnique({ where: { organizerId: args.organizerId } });
  const sameShop = existing && existing.shopId === shop.shopId;
  await db.etsyShopSettings.upsert({
    where: { organizerId: args.organizerId },
    create: {
      organizerId: args.organizerId,
      marketplaceAccountId: account.id,
      shopId: shop.shopId,
      shopName: shop.shopName,
      shopCurrency: shop.shopCurrency,
    },
    update: {
      marketplaceAccountId: account.id,
      shopId: shop.shopId,
      shopName: shop.shopName,
      shopCurrency: shop.shopCurrency,
      // A different shop invalidates the saved defaults and the poll cursor.
      ...(sameShop
        ? {}
        : { defaultShippingProfileId: null, defaultReturnPolicyId: null, defaultReadinessStateId: null, receiptCursor: null }),
    },
  });

  return { shopId: shop.shopId, shopName: shop.shopName, shopCurrency: shop.shopCurrency, grantedScopes };
}

// ---------------------------------------------------------------------------------------------
// Access token with single-flight refresh
// ---------------------------------------------------------------------------------------------

/** Mark the account NEEDS_REAUTH, release the lease and raise a Sentry warning. */
export async function markEtsyNeedsReauth(
  args: { accountId: string; organizerId: string; message: string; step: string },
  deps: EtsyAuthDeps = {}
): Promise<void> {
  const db = getDb(deps);
  await db.marketplaceAccount.update({
    where: { id: args.accountId },
    data: {
      status: 'NEEDS_REAUTH',
      lastErrorAt: getNow(deps),
      lastErrorMessage: scrubEtsySecrets(args.message, getEnv(deps)).slice(0, 300),
      refreshLeaseUntil: null,
    },
  });
  captureEtsyEvent('warning', 'Etsy account needs reauthorization', {
    area: 'auth',
    step: args.step,
    extra: { organizerId: args.organizerId },
  }, getEnv(deps));
}

async function loadAccount(db: EtsyDb, organizerId: string): Promise<any> {
  return db.marketplaceAccount.findUnique({
    where: { organizerId_platform: { organizerId, platform: 'ETSY' } },
  });
}

function assertUsable(account: any): void {
  if (!account) throw new EtsyError('ETSY_NOT_CONNECTED', 'No Etsy account is connected');
  if (account.status !== 'ACTIVE') throw new EtsyError('ETSY_NEEDS_REAUTH', 'Etsy needs the organizer to reconnect');
}

export interface GetEtsyTokenOptions {
  /** The access token Etsy just rejected with 401: force a refresh unless the stored token already differs. */
  rejectedToken?: string;
  /** Priority of the token-endpoint call. URGENT by default; the keepalive uses BACKGROUND. */
  priority?: EtsyPriority;
}

/**
 * Return a decrypted access token that is good for at least 5 more minutes, refreshing it
 * (single-flight, lease based) when needed. Throws EtsyError: ETSY_NOT_CONNECTED, ETSY_NEEDS_REAUTH
 * (no network when the account is already NEEDS_REAUTH), ETSY_REFRESH_BUSY (retryable),
 * ETSY_REFRESH_FAILED (retryable) or the door's own errors (ETSY_DISABLED, ETSY_BUDGET, ...).
 */
export async function getValidEtsyAccessToken(
  organizerId: string,
  deps: EtsyAuthDeps = {},
  opts: GetEtsyTokenOptions = {}
): Promise<string> {
  const db = getDb(deps);
  const env = getEnv(deps);
  const crypt = deps.crypto ?? loadEtsyTokenCrypto();

  const isFresh = (account: any): boolean => {
    if (opts.rejectedToken !== undefined) return crypt.decrypt(account.accessToken) !== opts.rejectedToken;
    const exp: Date | null = account.tokenExpiresAt ?? null;
    return exp instanceof Date && exp.getTime() - getNow(deps).getTime() > ETSY_REFRESH_EARLY_MS;
  };

  let account = await loadAccount(db, organizerId);
  assertUsable(account);
  if (isFresh(account)) return crypt.decrypt(account.accessToken);

  const now = getNow(deps);
  const claimed = await db.marketplaceAccount.updateMany({
    where: { id: account.id, OR: [{ refreshLeaseUntil: null }, { refreshLeaseUntil: { lt: now } }] },
    data: { refreshLeaseUntil: new Date(now.getTime() + ETSY_REFRESH_LEASE_MS) },
  });

  if (claimed && claimed.count === 1) {
    let leaseHeld = true;
    const releaseLease = async () => {
      if (!leaseHeld) return;
      leaseHeld = false;
      try {
        await db.marketplaceAccount.updateMany({ where: { id: account.id }, data: { refreshLeaseUntil: null } });
      } catch (err: any) {
        console.warn('[etsy-auth] could not release refresh lease:', scrubEtsySecrets(err?.message || String(err), env));
      }
    };
    try {
      // Someone may have refreshed between our read and the lease; re-read before spending a call.
      account = await loadAccount(db, organizerId);
      assertUsable(account);
      if (isFresh(account)) return crypt.decrypt(account.accessToken);

      if (!account.refreshToken) {
        await markEtsyNeedsReauth({ accountId: account.id, organizerId, message: 'No Etsy refresh token is stored', step: 'refresh' }, deps);
        leaseHeld = false;
        throw new EtsyError('ETSY_NEEDS_REAUTH', 'Etsy needs the organizer to reconnect');
      }
      const clientId = (env.ETSY_API_KEY ?? '').trim();
      if (!clientId) throw new EtsyError('ETSY_NOT_CONFIGURED', 'ETSY_API_KEY is not set');

      const res = await tokenRequestFn(deps)(
        { grant_type: 'refresh_token', client_id: clientId, refresh_token: crypt.decrypt(account.refreshToken) },
        { priority: opts.priority ?? 'URGENT', organizerId }
      );

      if (res.ok) {
        const tokens = parseTokenPayload(res.data);
        if (!tokens) throw new EtsyError('ETSY_REFRESH_FAILED', 'Etsy returned an unexpected refresh response', { status: res.status });
        const at = getNow(deps);
        await db.marketplaceAccount.update({
          where: { id: account.id },
          data: {
            accessToken: crypt.encrypt(tokens.accessToken),
            refreshToken: crypt.encrypt(tokens.refreshToken),
            tokenExpiresAt: new Date(at.getTime() + tokens.expiresInSeconds * 1000),
            refreshTokenExpiresAt: new Date(at.getTime() + ETSY_REFRESH_TOKEN_LIFETIME_MS),
            lastRefreshedAt: at,
            refreshLeaseUntil: null,
            lastErrorMessage: null,
            lastErrorAt: null,
          },
        });
        leaseHeld = false;
        return tokens.accessToken;
      }

      const summary = summarizeEtsyError(res, env);
      if (res.status === 401 || (res.status === 400 && summary.code === 'invalid_grant')) {
        await markEtsyNeedsReauth(
          { accountId: account.id, organizerId, message: `Etsy rejected the refresh token (${summary.code ?? res.status})`, step: 'refresh' },
          deps
        );
        leaseHeld = false;
        throw new EtsyError('ETSY_NEEDS_REAUTH', 'Etsy needs the organizer to reconnect', { status: res.status });
      }
      captureEtsyEvent('warning', 'Etsy token refresh failed (account left active)', {
        area: 'auth',
        step: 'refresh',
        extra: { organizerId, status: res.status, etsyError: summary.code },
      }, env);
      throw new EtsyError('ETSY_REFRESH_FAILED', 'Etsy token refresh failed', { status: res.status });
    } finally {
      await releaseLease();
    }
  }

  // Lost the race: poll the row until the winner has written a fresh token.
  const sleep = getSleep(deps);
  const startedAt = getNow(deps).getTime();
  for (;;) {
    await sleep(ETSY_REFRESH_POLL_MS);
    account = await loadAccount(db, organizerId);
    assertUsable(account);
    if (isFresh(account)) return crypt.decrypt(account.accessToken);
    if (getNow(deps).getTime() - startedAt >= ETSY_REFRESH_POLL_MAX_MS) break;
  }
  throw new EtsyError('ETSY_REFRESH_BUSY', 'Another request is refreshing the Etsy token');
}

/**
 * Authenticated Etsy call for one organizer: valid token, one call; on a live 401 exactly one
 * refresh plus one retry, then NEEDS_REAUTH.
 */
export async function etsyAuthedRequest(
  organizerId: string,
  opts: Omit<EtsyRequestOptions, 'accessToken' | 'organizerId'>,
  deps: EtsyAuthDeps = {}
): Promise<EtsyResponse> {
  const send = requestFn(deps);
  // Token refresh stays URGENT whatever the caller's priority (ADR-135 D5.3: token refresh is an URGENT class).
  const token = await getValidEtsyAccessToken(organizerId, deps);
  const first = await send({ ...opts, organizerId, accessToken: token });
  if (first.status !== 401) return first;

  const fresh = await getValidEtsyAccessToken(organizerId, deps, { rejectedToken: token });
  const second = await send({ ...opts, organizerId, accessToken: fresh });
  if (second.status !== 401) return second;

  const account = await loadAccount(getDb(deps), organizerId);
  if (account) {
    await markEtsyNeedsReauth(
      { accountId: account.id, organizerId, message: 'Etsy rejected a freshly refreshed access token', step: 'live-401' },
      deps
    );
  }
  throw new EtsyError('ETSY_NEEDS_REAUTH', 'Etsy needs the organizer to reconnect', { status: 401 });
}

// ---------------------------------------------------------------------------------------------
// Disconnect (DELETE /connection)
// ---------------------------------------------------------------------------------------------

export const ETSY_LIVE_LISTING_STATES = ['ACTIVE', 'DRAFT_READY'] as const;
const ETSY_TERMINAL_LISTING_STATES = ['ENDED', 'SOLD', 'ORPHANED'];

export interface DisconnectResult {
  /** True when the account row was removed. */
  disconnected: boolean;
  /** True when listings are live and the caller must retry with confirm=true. */
  needsConfirm: boolean;
  activeListingCount: number;
  orphanedListingCount: number;
}

/**
 * Remove the organizer's Etsy connection. When any listing is ACTIVE or DRAFT_READY the first call
 * returns needsConfirm; with confirm the account row is deleted (cascade removes EtsyShopSettings)
 * and remaining listing rows become ORPHANED. Etsy has no documented revoke endpoint, so remote
 * revocation is not attempted (UNVERIFIED, T3).
 */
export async function disconnectEtsyAccount(
  args: { organizerId: string; confirm: boolean },
  deps: EtsyAuthDeps = {}
): Promise<DisconnectResult> {
  const db = getDb(deps);
  const activeListingCount: number = await db.etsyListing.count({
    where: { organizerId: args.organizerId, state: { in: [...ETSY_LIVE_LISTING_STATES] } },
  });
  if (activeListingCount > 0 && !args.confirm) {
    return { disconnected: false, needsConfirm: true, activeListingCount, orphanedListingCount: 0 };
  }
  let orphanedListingCount = 0;
  await db.$transaction(async (tx: any) => {
    const orphaned = await tx.etsyListing.updateMany({
      where: { organizerId: args.organizerId, state: { notIn: ETSY_TERMINAL_LISTING_STATES } },
      data: { state: 'ORPHANED' },
    });
    orphanedListingCount = orphaned?.count ?? 0;
    await tx.marketplaceAccount.deleteMany({ where: { organizerId: args.organizerId, platform: 'ETSY' } });
  });
  return { disconnected: true, needsConfirm: false, activeListingCount, orphanedListingCount };
}

// ---------------------------------------------------------------------------------------------
// Connection status (GET /connection) and shop setup (GET/PUT /shop-setup)
// ---------------------------------------------------------------------------------------------

export function findMissingEtsyScopes(grantedScopes: string | null | undefined): string[] {
  const have = new Set(String(grantedScopes ?? '').split(/\s+/).filter(Boolean));
  return ETSY_SCOPES.filter((s) => !have.has(s));
}

export interface EtsyConnectionStatus {
  enabled: true;
  pushEnabled: boolean;
  allowed: boolean;
  connected: boolean;
  status: string | null;
  needsReauth: boolean;
  missingScopes: string[];
  refreshExpiresSoon: boolean;
  shopId: string | null;
  shopName: string | null;
  shopCurrency: string | null;
  currencySupported: boolean;
  setupComplete: boolean;
  defaultShippingProfileId: string | null;
  defaultReturnPolicyId: string | null;
  defaultReadinessStateId: string | null;
  connectedAt: Date | null;
  lastRefreshedAt: Date | null;
  lastError: string | null;
  etsyBusy: boolean;
  retryAt: Date | null;
  attribution: string;
}

/** Local-only status (no Etsy call, no budget spend). */
export async function getEtsyConnectionStatus(organizerId: string, deps: EtsyAuthDeps = {}): Promise<EtsyConnectionStatus> {
  const db = getDb(deps);
  const env = getEnv(deps);
  const now = getNow(deps);
  const account = await db.marketplaceAccount.findUnique({
    where: { organizerId_platform: { organizerId, platform: 'ETSY' } },
    include: { etsyShopSettings: true },
  });
  const settings = account?.etsyShopSettings ?? null;
  const state = await db.etsyApiState.findUnique({ where: { id: ETSY_STATE_ID } });
  const blockedUntil: Date | null = state?.blockedUntil instanceof Date && state.blockedUntil.getTime() > now.getTime() ? state.blockedUntil : null;
  const currency: string | null = settings?.shopCurrency ?? null;
  const refreshExp: Date | null = account?.refreshTokenExpiresAt ?? null;
  return {
    enabled: true,
    pushEnabled: isEtsyPushEnabled(env),
    allowed: isOrganizerAllowedForEtsy(organizerId, env),
    connected: Boolean(account) && account.status === 'ACTIVE',
    status: account?.status ?? null,
    needsReauth: Boolean(account) && account.status !== 'ACTIVE',
    missingScopes: account ? findMissingEtsyScopes(account.grantedScopes) : [],
    refreshExpiresSoon: refreshExp instanceof Date && refreshExp.getTime() - now.getTime() < ETSY_REFRESH_SOON_MS,
    shopId: settings?.shopId ?? account?.externalShopId ?? null,
    shopName: settings?.shopName ?? null,
    shopCurrency: currency,
    currencySupported: currency === null || currency.toUpperCase() === 'USD',
    // A draft needs only a shipping profile and a processing (readiness) profile; the return policy is optional
    // everywhere else (saveEtsyShopSetup accepts a blank one and createEtsyDraft only requires the other two), so
    // it must not hold setupComplete false.
    setupComplete: Boolean(settings?.defaultShippingProfileId && settings?.defaultReadinessStateId),
    defaultShippingProfileId: settings?.defaultShippingProfileId ?? null,
    defaultReturnPolicyId: settings?.defaultReturnPolicyId ?? null,
    defaultReadinessStateId: settings?.defaultReadinessStateId ?? null,
    connectedAt: account?.connectedAt ?? null,
    lastRefreshedAt: account?.lastRefreshedAt ?? null,
    lastError: account?.lastErrorMessage ?? null,
    etsyBusy: blockedUntil !== null,
    retryAt: blockedUntil,
    attribution: ETSY_ATTRIBUTION,
  };
}

export interface EtsyShopSetupOptions {
  shippingProfiles: Array<{ id: string; title: string }>;
  returnPolicies: Array<{ id: string; label: string }>;
  processingProfiles: Array<{ id: string; label: string }>;
  selected: {
    defaultShippingProfileId: string | null;
    defaultReturnPolicyId: string | null;
    defaultReadinessStateId: string | null;
  };
  /** True when the shop has no shipping profile or no processing profile (we cannot create them: no shops_w). */
  needsEtsySideSetup: boolean;
}

function returnPolicyLabel(p: any): string {
  const accepts = p?.accepts_returns === true;
  const exchanges = p?.accepts_exchanges === true;
  const days = typeof p?.return_deadline === 'number' ? p.return_deadline : null;
  if (accepts) return days ? `Returns accepted within ${days} days` : 'Returns accepted';
  if (exchanges) return days ? `Exchanges accepted within ${days} days` : 'Exchanges accepted';
  return 'No returns or exchanges';
}

async function loadShopSettings(db: EtsyDb, organizerId: string): Promise<any> {
  const settings = await db.etsyShopSettings.findUnique({ where: { organizerId } });
  if (!settings) throw new EtsyError('ETSY_NOT_CONNECTED', 'No Etsy shop is connected');
  return settings;
}

/**
 * Fetch the organizer's shipping profiles (shops_r), return policies (public) and processing
 * profiles (getShopReadinessStateDefinitions, shops_r) freshly from Etsy, INTERACTIVE priority.
 * Paths and response fields are from the OpenAPI spec 3.0.0 (fetched 2026-10-03).
 */
export async function fetchEtsyShopSetupOptions(organizerId: string, deps: EtsyAuthDeps = {}): Promise<EtsyShopSetupOptions> {
  const db = getDb(deps);
  const settings = await loadShopSettings(db, organizerId);
  const shopPath = `/v3/application/shops/${encodeURIComponent(settings.shopId)}`;

  const ship = await etsyAuthedRequest(organizerId, { method: 'GET', path: `${shopPath}/shipping-profiles`, priority: 'INTERACTIVE' }, deps);
  const ret = await etsyAuthedRequest(organizerId, { method: 'GET', path: `${shopPath}/policies/return`, priority: 'INTERACTIVE' }, deps);
  const proc = await etsyAuthedRequest(
    organizerId,
    { method: 'GET', path: `${shopPath}/readiness-state-definitions`, priority: 'INTERACTIVE', query: { limit: 100 } },
    deps
  );
  for (const r of [ship, ret, proc]) {
    if (!r.ok) throw new EtsyError('ETSY_UPSTREAM', `Etsy setup lookup failed with HTTP ${r.status}`, { status: r.status });
  }

  const shippingProfiles = (Array.isArray(ship.data?.results) ? ship.data.results : [])
    .filter((p: any) => p && p.shipping_profile_id !== undefined && p.is_deleted !== true)
    .map((p: any) => ({ id: String(p.shipping_profile_id), title: String(p.title ?? `Profile ${p.shipping_profile_id}`) }));
  const returnPolicies = (Array.isArray(ret.data?.results) ? ret.data.results : [])
    .filter((p: any) => p && p.return_policy_id !== undefined)
    .map((p: any) => ({ id: String(p.return_policy_id), label: returnPolicyLabel(p) }));
  const processingProfiles = (Array.isArray(proc.data?.results) ? proc.data.results : [])
    .filter((p: any) => p && p.readiness_state_id !== undefined)
    .map((p: any) => ({
      id: String(p.readiness_state_id),
      label: String(p.processing_days_display_label ?? p.readiness_state ?? `Profile ${p.readiness_state_id}`),
    }));

  return {
    shippingProfiles,
    returnPolicies,
    processingProfiles,
    selected: {
      defaultShippingProfileId: settings.defaultShippingProfileId ?? null,
      defaultReturnPolicyId: settings.defaultReturnPolicyId ?? null,
      defaultReadinessStateId: settings.defaultReadinessStateId ?? null,
    },
    needsEtsySideSetup: shippingProfiles.length === 0 || processingProfiles.length === 0,
  };
}

/**
 * Validate the chosen ids against freshly fetched lists (never trust client ids) and save them as
 * the organizer's defaults. A return policy is optional; shipping and processing profiles are required.
 */
export async function saveEtsyShopSetup(
  args: { organizerId: string; shippingProfileId: unknown; returnPolicyId: unknown; readinessStateId: unknown },
  deps: EtsyAuthDeps = {}
): Promise<{ ok: true } | { ok: false; field: 'shippingProfileId' | 'returnPolicyId' | 'readinessStateId' }> {
  const asId = (v: unknown): string | null => (typeof v === 'string' || typeof v === 'number') && /^\d{1,20}$/.test(String(v)) ? String(v) : null;
  const shippingProfileId = asId(args.shippingProfileId);
  const readinessStateId = asId(args.readinessStateId);
  const returnPolicyId = args.returnPolicyId === null || args.returnPolicyId === undefined || args.returnPolicyId === '' ? null : asId(args.returnPolicyId);
  if (!shippingProfileId) return { ok: false, field: 'shippingProfileId' };
  if (!readinessStateId) return { ok: false, field: 'readinessStateId' };
  if (args.returnPolicyId !== null && args.returnPolicyId !== undefined && args.returnPolicyId !== '' && !returnPolicyId) {
    return { ok: false, field: 'returnPolicyId' };
  }

  const options = await fetchEtsyShopSetupOptions(args.organizerId, deps);
  if (!options.shippingProfiles.some((p) => p.id === shippingProfileId)) return { ok: false, field: 'shippingProfileId' };
  if (!options.processingProfiles.some((p) => p.id === readinessStateId)) return { ok: false, field: 'readinessStateId' };
  if (returnPolicyId && !options.returnPolicies.some((p) => p.id === returnPolicyId)) return { ok: false, field: 'returnPolicyId' };

  await getDb(deps).etsyShopSettings.update({
    where: { organizerId: args.organizerId },
    data: {
      defaultShippingProfileId: shippingProfileId,
      defaultReturnPolicyId: returnPolicyId,
      defaultReadinessStateId: readinessStateId,
    },
  });
  return { ok: true };
}
