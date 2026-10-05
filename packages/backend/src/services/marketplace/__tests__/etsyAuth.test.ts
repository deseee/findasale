/**
 * etsyAuth.ts -- ADR-135 batch B1 acceptance items 3 (refresh single-flight, invalid_grant,
 * 5xx, live 401) and 7 (connect URL, allowlist, kill switch), plus the callback, disconnect,
 * connection status and shop setup logic. The database is an in-memory fake, the token endpoint and
 * API are injected fakes, and tokenCrypto is replaced by a reversible fake: nothing touches Etsy.
 */

jest.mock('@sentry/node', () => ({ captureMessage: jest.fn() }));

import {
  ETSY_ATTRIBUTION,
  ETSY_REFRESH_TOKEN_LIFETIME_MS,
  assertEtsyConnectAllowed,
  buildEtsyRedirectUri,
  completeEtsyConnect,
  disconnectEtsyAccount,
  etsyAuthedRequest,
  etsyUserIdFromAccessToken,
  fetchEtsyShopSetupOptions,
  findMissingEtsyScopes,
  getEtsyAccessTier,
  getEtsyConnectionStatus,
  getValidEtsyAccessToken,
  isOrganizerAllowedForEtsy,
  parseAllowedOrganizerIds,
  saveEtsyShopSetup,
  startEtsyConnect,
} from '../etsyAuth';
import type { EtsyAuthDeps } from '../etsyAuth';
import { deriveCodeChallenge, ETSY_SCOPES, ETSY_SCOPE_STRING } from '../etsyOAuthState';
import { EtsyError } from '../etsyBudget';
import { etsyResp, fakeTokenCrypto, makeEtsyFakeDb } from './etsyFakeDb';

const NOW = new Date('2026-10-03T12:00:00.000Z');
const ENV = {
  ETSY_CONNECTOR_ENABLED: 'true',
  ETSY_API_KEY: 'KEYSTRING',
  ETSY_SHARED_SECRET: 'SHAREDSECRET',
  ETSY_ACCESS_TIER: 'personal',
  ETSY_ALLOWED_ORGANIZER_IDS: 'org_1, org_9',
  FRONTEND_URL: 'https://finda.sale',
};
const minutes = (m: number) => new Date(NOW.getTime() + m * 60_000);

const NEW_TOKENS = { access_token: '1001.NEWACCESSTOKEN0000000000', refresh_token: '1001.NEWREFRESHTOKEN000000000', expires_in: 3600, token_type: 'Bearer' };

function seedAccount(db: any, over: Record<string, any> = {}) {
  const row = {
    id: 'acct_seed',
    organizerId: 'org_1',
    platform: 'ETSY',
    status: 'ACTIVE',
    accessToken: fakeTokenCrypto.encrypt('1001.OLDACCESSTOKEN'),
    refreshToken: fakeTokenCrypto.encrypt('1001.OLDREFRESHTOKEN'),
    tokenExpiresAt: minutes(2), // inside the 5 minute early window: needs a refresh
    refreshTokenExpiresAt: new Date(NOW.getTime() + 80 * 24 * 3600_000),
    externalUserId: '1001',
    externalShopId: '555',
    grantedScopes: ETSY_SCOPE_STRING,
    connectedAt: new Date('2026-09-01T00:00:00Z'),
    lastRefreshedAt: new Date('2026-10-03T11:00:00Z'),
    lastErrorAt: null,
    lastErrorMessage: null,
    refreshLeaseUntil: null,
    ...over,
  };
  db.store.accounts.push(row);
  return row;
}

function seedSettings(db: any, over: Record<string, any> = {}) {
  const row = {
    id: 'settings_seed',
    organizerId: 'org_1',
    marketplaceAccountId: 'acct_seed',
    shopId: '555',
    shopName: 'Seed Shop',
    shopCurrency: 'USD',
    defaultShippingProfileId: null,
    defaultReturnPolicyId: null,
    defaultReadinessStateId: null,
    receiptCursor: null,
    ...over,
  };
  db.store.settings.push(row);
  return row;
}

function makeCtx(opts: { tokenRequest?: any; request?: any; env?: Record<string, string | undefined>; now?: () => Date } = {}) {
  const db = makeEtsyFakeDb();
  const tokenRequest = jest.fn(opts.tokenRequest ?? (async () => etsyResp(200, NEW_TOKENS)));
  const request = jest.fn(opts.request ?? (async () => etsyResp(200, {})));
  const deps: EtsyAuthDeps = {
    db,
    env: opts.env ?? ENV,
    now: opts.now ?? (() => NOW),
    sleep: () => new Promise<void>((r) => setImmediate(r)),
    crypto: fakeTokenCrypto,
    tokenRequest: tokenRequest as any,
    request: request as any,
  };
  return { db, deps, tokenRequest, request };
}

const accountOf = (db: any, id = 'acct_seed') => db.store.accounts.find((a: any) => a.id === id);

describe('getValidEtsyAccessToken: fresh and window (acceptance 3)', () => {
  it('returns the stored token with no network when more than 5 minutes remain', async () => {
    const { db, deps, tokenRequest } = makeCtx();
    seedAccount(db, { tokenExpiresAt: minutes(6) });
    await expect(getValidEtsyAccessToken('org_1', deps)).resolves.toBe('1001.OLDACCESSTOKEN');
    expect(tokenRequest).not.toHaveBeenCalled();
  });

  it('refreshes when 5 minutes or less remain', async () => {
    const { db, deps, tokenRequest } = makeCtx();
    seedAccount(db, { tokenExpiresAt: minutes(5) });
    await expect(getValidEtsyAccessToken('org_1', deps)).resolves.toBe(NEW_TOKENS.access_token);
    expect(tokenRequest).toHaveBeenCalledTimes(1);
  });

  it('refreshes when tokenExpiresAt is missing', async () => {
    const { db, deps, tokenRequest } = makeCtx();
    seedAccount(db, { tokenExpiresAt: null });
    await getValidEtsyAccessToken('org_1', deps);
    expect(tokenRequest).toHaveBeenCalledTimes(1);
  });

  it('throws ETSY_NOT_CONNECTED without an account', async () => {
    const { deps, tokenRequest } = makeCtx();
    await expect(getValidEtsyAccessToken('org_1', deps)).rejects.toMatchObject({ code: 'ETSY_NOT_CONNECTED' });
    expect(tokenRequest).not.toHaveBeenCalled();
  });
});

describe('single-flight refresh (acceptance 3)', () => {
  it('two concurrent calls on an expiring token cause exactly one token-endpoint call and both get the new token', async () => {
    let release!: () => void;
    const gateOpen = new Promise<void>((r) => {
      release = r;
    });
    const { db, deps, tokenRequest } = makeCtx({
      tokenRequest: async () => {
        await gateOpen; // hold the winner inside the token call so the loser really overlaps it
        return etsyResp(200, NEW_TOKENS);
      },
    });
    seedAccount(db);

    const a = getValidEtsyAccessToken('org_1', deps);
    const b = getValidEtsyAccessToken('org_1', deps);
    // Let both callers reach the lease: one wins, one polls.
    await new Promise((r) => setTimeout(r, 20));
    expect(tokenRequest).toHaveBeenCalledTimes(1);
    expect(accountOf(db).refreshLeaseUntil).toEqual(new Date(NOW.getTime() + 30_000));
    release();

    await expect(Promise.all([a, b])).resolves.toEqual([NEW_TOKENS.access_token, NEW_TOKENS.access_token]);
    expect(tokenRequest).toHaveBeenCalledTimes(1);

    const params = tokenRequest.mock.calls[0][0];
    expect(params).toEqual({ grant_type: 'refresh_token', client_id: 'KEYSTRING', refresh_token: '1001.OLDREFRESHTOKEN' });
    expect(params).not.toHaveProperty('client_secret');
    expect(tokenRequest.mock.calls[0][1]).toMatchObject({ priority: 'URGENT', organizerId: 'org_1' });

    // One UPDATE persisted the newest pair, encrypted, and cleared the lease.
    const row = accountOf(db);
    expect(row.accessToken.startsWith('enc:v1:')).toBe(true);
    expect(row.refreshToken.startsWith('enc:v1:')).toBe(true);
    expect(fakeTokenCrypto.decrypt(row.accessToken)).toBe(NEW_TOKENS.access_token);
    expect(fakeTokenCrypto.decrypt(row.refreshToken)).toBe(NEW_TOKENS.refresh_token);
    expect(row.tokenExpiresAt).toEqual(new Date(NOW.getTime() + 3600_000));
    expect(row.refreshTokenExpiresAt).toEqual(new Date(NOW.getTime() + ETSY_REFRESH_TOKEN_LIFETIME_MS));
    expect(row.lastRefreshedAt).toEqual(NOW);
    expect(row.refreshLeaseUntil).toBeNull();
    expect(row.lastErrorMessage).toBeNull();
    expect(row.status).toBe('ACTIVE');
  });

  it('a caller that finds a live lease held elsewhere waits for the fresh token instead of refreshing', async () => {
    const { db, deps, tokenRequest } = makeCtx();
    seedAccount(db, { refreshLeaseUntil: minutes(0.5) });
    const p = getValidEtsyAccessToken('org_1', deps);
    await new Promise((r) => setTimeout(r, 10));
    // The "other process" finishes its refresh.
    Object.assign(accountOf(db), { accessToken: fakeTokenCrypto.encrypt('1001.OTHERPROCESSTOKEN'), tokenExpiresAt: minutes(55), refreshLeaseUntil: null });
    await expect(p).resolves.toBe('1001.OTHERPROCESSTOKEN');
    expect(tokenRequest).not.toHaveBeenCalled();
  });

  it('fails retryably (ETSY_REFRESH_BUSY) when the lease holder does not finish within 8 seconds', async () => {
    let t = NOW.getTime();
    const { db, deps, tokenRequest } = makeCtx({
      now: () => {
        t += 3000;
        return new Date(t);
      },
    });
    seedAccount(db, { refreshLeaseUntil: new Date(NOW.getTime() + 600_000) });
    await expect(getValidEtsyAccessToken('org_1', deps)).rejects.toMatchObject({ code: 'ETSY_REFRESH_BUSY' });
    expect(tokenRequest).not.toHaveBeenCalled();
  });

  it('takes over an expired lease', async () => {
    const { db, deps, tokenRequest } = makeCtx();
    seedAccount(db, { refreshLeaseUntil: new Date(NOW.getTime() - 1000) });
    await expect(getValidEtsyAccessToken('org_1', deps)).resolves.toBe(NEW_TOKENS.access_token);
    expect(tokenRequest).toHaveBeenCalledTimes(1);
  });

  it('skips the token call when another process refreshed between our read and the lease', async () => {
    const { db, deps, tokenRequest } = makeCtx();
    seedAccount(db);
    // Wrap findUnique so the second read (after the lease) sees a fresh token.
    const original = db.marketplaceAccount.findUnique;
    let reads = 0;
    db.marketplaceAccount.findUnique = async (args: any) => {
      reads++;
      if (reads === 2) {
        Object.assign(accountOf(db), { accessToken: fakeTokenCrypto.encrypt('1001.JUSTREFRESHED'), tokenExpiresAt: minutes(55) });
      }
      return original(args);
    };
    await expect(getValidEtsyAccessToken('org_1', deps)).resolves.toBe('1001.JUSTREFRESHED');
    expect(tokenRequest).not.toHaveBeenCalled();
    expect(accountOf(db).refreshLeaseUntil).toBeNull();
  });
});

describe('refresh failures (acceptance 3)', () => {
  it('invalid_grant (HTTP 400) sets NEEDS_REAUTH, clears the lease, and later calls short-circuit with no network', async () => {
    const { db, deps, tokenRequest, request } = makeCtx({ tokenRequest: async () => etsyResp(400, { error: 'invalid_grant', error_description: 'refresh token revoked' }) });
    seedAccount(db);
    await expect(getValidEtsyAccessToken('org_1', deps)).rejects.toMatchObject({ code: 'ETSY_NEEDS_REAUTH' });
    const row = accountOf(db);
    expect(row.status).toBe('NEEDS_REAUTH');
    expect(row.lastErrorAt).toEqual(NOW);
    expect(row.lastErrorMessage).toContain('invalid_grant');
    expect(row.refreshLeaseUntil).toBeNull();
    expect(tokenRequest).toHaveBeenCalledTimes(1);

    // Every later call, token or API, short-circuits with ETSY_NEEDS_REAUTH and no network.
    await expect(getValidEtsyAccessToken('org_1', deps)).rejects.toMatchObject({ code: 'ETSY_NEEDS_REAUTH' });
    await expect(etsyAuthedRequest('org_1', { method: 'GET', path: '/v3/application/shops/555', priority: 'INTERACTIVE' }, deps)).rejects.toMatchObject({ code: 'ETSY_NEEDS_REAUTH' });
    expect(tokenRequest).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalled();
  });

  it('HTTP 401 on refresh also sets NEEDS_REAUTH', async () => {
    const { db, deps } = makeCtx({ tokenRequest: async () => etsyResp(401, { error: 'unauthorized' }) });
    seedAccount(db);
    await expect(getValidEtsyAccessToken('org_1', deps)).rejects.toMatchObject({ code: 'ETSY_NEEDS_REAUTH' });
    expect(accountOf(db).status).toBe('NEEDS_REAUTH');
  });

  it('a REVOKED account short-circuits as ETSY_NEEDS_REAUTH', async () => {
    const { db, deps, tokenRequest } = makeCtx();
    seedAccount(db, { status: 'REVOKED' });
    await expect(getValidEtsyAccessToken('org_1', deps)).rejects.toMatchObject({ code: 'ETSY_NEEDS_REAUTH' });
    expect(tokenRequest).not.toHaveBeenCalled();
  });

  it('5xx on refresh leaves the account ACTIVE, clears the lease, and the next call retries', async () => {
    const responses = [etsyResp(503, 'unavailable'), etsyResp(200, NEW_TOKENS)];
    const { db, deps, tokenRequest } = makeCtx({ tokenRequest: async () => responses.shift() });
    seedAccount(db);
    await expect(getValidEtsyAccessToken('org_1', deps)).rejects.toMatchObject({ code: 'ETSY_REFRESH_FAILED' });
    const row = accountOf(db);
    expect(row.status).toBe('ACTIVE');
    expect(row.refreshLeaseUntil).toBeNull();
    expect(fakeTokenCrypto.decrypt(row.accessToken)).toBe('1001.OLDACCESSTOKEN'); // untouched

    await expect(getValidEtsyAccessToken('org_1', deps)).resolves.toBe(NEW_TOKENS.access_token);
    expect(tokenRequest).toHaveBeenCalledTimes(2);
  });

  it('a 400 that is not invalid_grant keeps the account ACTIVE (not our decision to force re-consent)', async () => {
    const { db, deps } = makeCtx({ tokenRequest: async () => etsyResp(400, { error: 'invalid_request' }) });
    seedAccount(db);
    await expect(getValidEtsyAccessToken('org_1', deps)).rejects.toMatchObject({ code: 'ETSY_REFRESH_FAILED' });
    expect(accountOf(db).status).toBe('ACTIVE');
    expect(accountOf(db).refreshLeaseUntil).toBeNull();
  });

  it('a network or door error (ETSY_BUDGET) releases the lease, keeps ACTIVE and rethrows', async () => {
    const { db, deps } = makeCtx({
      tokenRequest: async () => {
        throw new EtsyError('ETSY_BUDGET', 'cap');
      },
    });
    seedAccount(db);
    await expect(getValidEtsyAccessToken('org_1', deps)).rejects.toMatchObject({ code: 'ETSY_BUDGET' });
    expect(accountOf(db).status).toBe('ACTIVE');
    expect(accountOf(db).refreshLeaseUntil).toBeNull();
  });

  it('a malformed 200 response changes nothing and releases the lease', async () => {
    const { db, deps } = makeCtx({ tokenRequest: async () => etsyResp(200, { access_token: 'x' }) });
    seedAccount(db);
    await expect(getValidEtsyAccessToken('org_1', deps)).rejects.toMatchObject({ code: 'ETSY_REFRESH_FAILED' });
    expect(fakeTokenCrypto.decrypt(accountOf(db).accessToken)).toBe('1001.OLDACCESSTOKEN');
    expect(accountOf(db).refreshLeaseUntil).toBeNull();
  });

  it('a missing refresh token means NEEDS_REAUTH without calling Etsy', async () => {
    const { db, deps, tokenRequest } = makeCtx();
    seedAccount(db, { refreshToken: null });
    await expect(getValidEtsyAccessToken('org_1', deps)).rejects.toMatchObject({ code: 'ETSY_NEEDS_REAUTH' });
    expect(accountOf(db).status).toBe('NEEDS_REAUTH');
    expect(tokenRequest).not.toHaveBeenCalled();
  });

  it('fails closed when ETSY_API_KEY is missing and releases the lease', async () => {
    const { db, deps, tokenRequest } = makeCtx({ env: { ...ENV, ETSY_API_KEY: '' } });
    seedAccount(db);
    await expect(getValidEtsyAccessToken('org_1', deps)).rejects.toMatchObject({ code: 'ETSY_NOT_CONFIGURED' });
    expect(tokenRequest).not.toHaveBeenCalled();
    expect(accountOf(db).refreshLeaseUntil).toBeNull();
  });

  it('can refresh at BACKGROUND priority (token keepalive)', async () => {
    const { db, deps, tokenRequest } = makeCtx();
    seedAccount(db);
    await getValidEtsyAccessToken('org_1', deps, { priority: 'BACKGROUND' });
    expect(tokenRequest.mock.calls[0][1]).toMatchObject({ priority: 'BACKGROUND' });
  });
});

describe('etsyAuthedRequest: live 401 (acceptance 3)', () => {
  const opts = { method: 'GET' as const, path: '/v3/application/shops/555/shipping-profiles', priority: 'INTERACTIVE' as const };

  it('passes a non-401 through with one call and the valid token', async () => {
    const { db, deps, request, tokenRequest } = makeCtx();
    seedAccount(db, { tokenExpiresAt: minutes(30) });
    const res = await etsyAuthedRequest('org_1', opts, deps);
    expect(res.status).toBe(200);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toMatchObject({ ...opts, organizerId: 'org_1', accessToken: '1001.OLDACCESSTOKEN' });
    expect(tokenRequest).not.toHaveBeenCalled();
  });

  it('a 401 triggers exactly one refresh and one retry with the new token', async () => {
    const responses = [etsyResp(401, { error: 'invalid_token' }), etsyResp(200, { ok: true })];
    const { db, deps, request, tokenRequest } = makeCtx({ request: async () => responses.shift() });
    seedAccount(db, { tokenExpiresAt: minutes(30) }); // fresh by time, but Etsy rejects it
    const res = await etsyAuthedRequest('org_1', opts, deps);
    expect(res).toMatchObject({ status: 200, data: { ok: true } });
    expect(tokenRequest).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][0].accessToken).toBe('1001.OLDACCESSTOKEN');
    expect(request.mock.calls[1][0].accessToken).toBe(NEW_TOKENS.access_token);
    expect(accountOf(db).status).toBe('ACTIVE');
  });

  it('a second 401 after the refresh sets NEEDS_REAUTH and throws, with no third request', async () => {
    const { db, deps, request, tokenRequest } = makeCtx({ request: async () => etsyResp(401, { error: 'invalid_token' }) });
    seedAccount(db, { tokenExpiresAt: minutes(30) });
    await expect(etsyAuthedRequest('org_1', opts, deps)).rejects.toMatchObject({ code: 'ETSY_NEEDS_REAUTH' });
    expect(request).toHaveBeenCalledTimes(2);
    expect(tokenRequest).toHaveBeenCalledTimes(1);
    expect(accountOf(db).status).toBe('NEEDS_REAUTH');
    expect(accountOf(db).refreshLeaseUntil).toBeNull();
  });

  it('if the refresh itself is rejected during a 401, the account is NEEDS_REAUTH and the call is not retried', async () => {
    const { db, deps, request } = makeCtx({
      request: async () => etsyResp(401, {}),
      tokenRequest: async () => etsyResp(400, { error: 'invalid_grant' }),
    });
    seedAccount(db, { tokenExpiresAt: minutes(30) });
    await expect(etsyAuthedRequest('org_1', opts, deps)).rejects.toMatchObject({ code: 'ETSY_NEEDS_REAUTH' });
    expect(request).toHaveBeenCalledTimes(1);
    expect(accountOf(db).status).toBe('NEEDS_REAUTH');
  });

  it('keeps the refresh at URGENT whatever the caller priority', async () => {
    const responses = [etsyResp(401, {}), etsyResp(200, {})];
    const { db, deps, tokenRequest } = makeCtx({ request: async () => responses.shift() });
    seedAccount(db, { tokenExpiresAt: minutes(30) });
    await etsyAuthedRequest('org_1', { ...opts, priority: 'BACKGROUND' }, deps);
    expect(tokenRequest.mock.calls[0][1]).toMatchObject({ priority: 'URGENT' });
  });
});

describe('tier gate, redirect URI and kill switch (acceptance 7)', () => {
  it('parses the allowlist and defaults the tier to personal (fail closed)', () => {
    expect(parseAllowedOrganizerIds({ ETSY_ALLOWED_ORGANIZER_IDS: ' a ,b,, c ' })).toEqual(['a', 'b', 'c']);
    expect(parseAllowedOrganizerIds({})).toEqual([]);
    expect(getEtsyAccessTier({})).toBe('personal');
    expect(getEtsyAccessTier({ ETSY_ACCESS_TIER: 'weird' })).toBe('personal');
    expect(getEtsyAccessTier({ ETSY_ACCESS_TIER: 'Commercial' })).toBe('commercial');
  });

  it('under personal only allowlisted organizers pass; under commercial the list is ignored', () => {
    expect(isOrganizerAllowedForEtsy('org_1', ENV)).toBe(true);
    expect(isOrganizerAllowedForEtsy('org_2', ENV)).toBe(false);
    expect(isOrganizerAllowedForEtsy('org_2', { ...ENV, ETSY_ALLOWED_ORGANIZER_IDS: '' })).toBe(false);
    expect(isOrganizerAllowedForEtsy('org_2', { ...ENV, ETSY_ACCESS_TIER: 'commercial' })).toBe(true);
    expect(isOrganizerAllowedForEtsy('org_2', { ETSY_ALLOWED_ORGANIZER_IDS: 'org_2' })).toBe(true); // tier unset = personal
  });

  it('builds the redirect URI server side from ETSY_REDIRECT_URI or FRONTEND_URL', () => {
    expect(buildEtsyRedirectUri({})).toBe('https://finda.sale/organizer/etsy-oauth-callback');
    expect(buildEtsyRedirectUri({ FRONTEND_URL: 'https://staging.finda.sale/' })).toBe('https://staging.finda.sale/organizer/etsy-oauth-callback');
    expect(buildEtsyRedirectUri({ FRONTEND_URL: 'https://x.test', ETSY_REDIRECT_URI: 'https://override.test/cb' })).toBe('https://override.test/cb');
  });

  it('assertEtsyConnectAllowed throws DISABLED, NOT_ALLOWED and NOT_CONFIGURED', () => {
    expect(() => assertEtsyConnectAllowed('org_1', { ...ENV, ETSY_CONNECTOR_ENABLED: 'false' })).toThrow(expect.objectContaining({ code: 'ETSY_DISABLED' }));
    expect(() => assertEtsyConnectAllowed('org_2', ENV)).toThrow(expect.objectContaining({ code: 'ETSY_NOT_ALLOWED' }));
    expect(() => assertEtsyConnectAllowed('org_1', { ...ENV, ETSY_API_KEY: undefined })).toThrow(expect.objectContaining({ code: 'ETSY_NOT_CONFIGURED' }));
    expect(() => assertEtsyConnectAllowed('org_1', ENV)).not.toThrow();
  });

  it('startEtsyConnect returns an authorize URL with PKCE S256, the five scopes, the server-built redirect_uri and state', async () => {
    const { db, deps } = makeCtx();
    const { authorizeUrl } = await startEtsyConnect({ organizerId: 'org_1', userId: 'user_1' }, deps);
    const url = new URL(authorizeUrl);
    expect(`${url.origin}${url.pathname}`).toBe('https://www.etsy.com/oauth/connect');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('client_id')).toBe('KEYSTRING');
    expect(url.searchParams.get('redirect_uri')).toBe('https://finda.sale/organizer/etsy-oauth-callback');
    expect(url.searchParams.get('scope')!.split(' ')).toEqual([...ETSY_SCOPES]);
    expect(url.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // The challenge in the URL pairs with the verifier stored (encrypted) for this state.
    expect(db.store.states).toHaveLength(1);
    expect(db.store.states[0].organizerId).toBe('org_1');
    expect(db.store.states[0].userId).toBe('user_1');
    expect(deriveCodeChallenge(fakeTokenCrypto.decrypt(db.store.states[0].codeVerifierEnc))).toBe(url.searchParams.get('code_challenge'));
    // The raw state is not stored anywhere in the row.
    expect(JSON.stringify(db.store.states[0])).not.toContain(url.searchParams.get('state')!);
  });

  it('rejects non-allowlisted organizers under personal, and creates no state', async () => {
    const { db, deps } = makeCtx();
    await expect(startEtsyConnect({ organizerId: 'org_2', userId: 'user_2' }, deps)).rejects.toMatchObject({ code: 'ETSY_NOT_ALLOWED' });
    await expect(completeEtsyConnect({ organizerId: 'org_2', userId: 'user_2', code: 'abcdefghij', state: 'x'.repeat(43) }, deps)).rejects.toMatchObject({ code: 'ETSY_NOT_ALLOWED' });
    expect(db.store.states).toHaveLength(0);
  });

  it('admits any organizer under commercial', async () => {
    const { deps } = makeCtx({ env: { ...ENV, ETSY_ACCESS_TIER: 'commercial' } });
    await expect(startEtsyConnect({ organizerId: 'org_2', userId: 'user_2' }, deps)).resolves.toHaveProperty('authorizeUrl');
  });

  it('is refused with the kill switch off and creates no state', async () => {
    const { db, deps } = makeCtx({ env: { ...ENV, ETSY_CONNECTOR_ENABLED: undefined } });
    await expect(startEtsyConnect({ organizerId: 'org_1', userId: 'user_1' }, deps)).rejects.toMatchObject({ code: 'ETSY_DISABLED' });
    expect(db.store.states).toHaveLength(0);
  });

  it('fails closed (ETSY_NOT_CONFIGURED) when token encryption is not configured', async () => {
    const saved = process.env.SOCIAL_TOKEN_ENC_KEY;
    delete process.env.SOCIAL_TOKEN_ENC_KEY;
    try {
      const { db, deps } = makeCtx();
      let p!: Promise<unknown>;
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require('../etsyAuth');
        p = mod.startEtsyConnect({ organizerId: 'org_1', userId: 'user_1' }, { ...deps, crypto: undefined });
      });
      await expect(p).rejects.toMatchObject({ code: 'ETSY_NOT_CONFIGURED' });
      expect(db.store.states).toHaveLength(0); // nothing was stored, in particular no plaintext verifier
    } finally {
      if (saved !== undefined) process.env.SOCIAL_TOKEN_ENC_KEY = saved;
    }
  });
});

describe('completeEtsyConnect', () => {
  const SHOP = { shop_id: 555, shop_name: 'Vintage Corner', currency_code: 'USD', user_id: 1001 };
  const CODE = 'authcode-0123456789';

  function shopRequest(shop: any = SHOP, status = 200) {
    return async (opts: any) => {
      if (opts.path === '/v3/application/users/1001/shops') return etsyResp(status, status === 200 ? shop : { error: 'nope' });
      return etsyResp(404, {});
    };
  }

  async function startAndGetState(ctx: ReturnType<typeof makeCtx>, organizerId = 'org_1', userId = 'user_1') {
    const { authorizeUrl } = await startEtsyConnect({ organizerId, userId }, ctx.deps);
    const url = new URL(authorizeUrl);
    return { state: url.searchParams.get('state')!, challenge: url.searchParams.get('code_challenge')! };
  }

  it('exchanges the code with the PKCE verifier, stores encrypted tokens and links the shop', async () => {
    const ctx = makeCtx({
      tokenRequest: async () => etsyResp(200, { access_token: '1001.ACCESSTOKEN00000000000', refresh_token: '1001.REFRESHTOKEN0000000000', expires_in: 3600, token_type: 'Bearer', scope: ETSY_SCOPE_STRING }),
      request: shopRequest(),
    });
    const { state, challenge } = await startAndGetState(ctx);
    const out = await completeEtsyConnect({ organizerId: 'org_1', userId: 'user_1', code: CODE, state }, ctx.deps);
    expect(out).toEqual({ shopId: '555', shopName: 'Vintage Corner', shopCurrency: 'USD', grantedScopes: ETSY_SCOPE_STRING });

    const params = ctx.tokenRequest.mock.calls[0][0];
    expect(params).toMatchObject({
      grant_type: 'authorization_code',
      client_id: 'KEYSTRING',
      redirect_uri: 'https://finda.sale/organizer/etsy-oauth-callback',
      code: CODE,
    });
    expect(params).not.toHaveProperty('client_secret');
    expect(deriveCodeChallenge(params.code_verifier)).toBe(challenge);

    const row = ctx.db.store.accounts[0];
    expect(row).toMatchObject({ organizerId: 'org_1', platform: 'ETSY', status: 'ACTIVE', externalUserId: '1001', externalShopId: '555', grantedScopes: ETSY_SCOPE_STRING, refreshLeaseUntil: null });
    expect(fakeTokenCrypto.decrypt(row.accessToken)).toBe('1001.ACCESSTOKEN00000000000');
    expect(fakeTokenCrypto.decrypt(row.refreshToken)).toBe('1001.REFRESHTOKEN0000000000');
    expect(row.tokenExpiresAt).toEqual(new Date(NOW.getTime() + 3600_000));
    expect(row.refreshTokenExpiresAt).toEqual(new Date(NOW.getTime() + ETSY_REFRESH_TOKEN_LIFETIME_MS));
    expect(ctx.db.store.settings[0]).toMatchObject({ organizerId: 'org_1', marketplaceAccountId: row.id, shopId: '555', shopName: 'Vintage Corner', shopCurrency: 'USD' });
  });

  it('records the requested scopes when the token response omits scope', async () => {
    const ctx = makeCtx({ request: shopRequest() });
    const { state } = await startAndGetState(ctx);
    const out = await completeEtsyConnect({ organizerId: 'org_1', userId: 'user_1', code: CODE, state }, ctx.deps);
    expect(out.grantedScopes).toBe(ETSY_SCOPE_STRING);
  });

  it('is single-use: a replay of the same state fails with the generic state error and makes no token call', async () => {
    const ctx = makeCtx({ request: shopRequest() });
    const { state } = await startAndGetState(ctx);
    await completeEtsyConnect({ organizerId: 'org_1', userId: 'user_1', code: CODE, state }, ctx.deps);
    ctx.tokenRequest.mockClear();
    await expect(completeEtsyConnect({ organizerId: 'org_1', userId: 'user_1', code: CODE, state }, ctx.deps)).rejects.toMatchObject({ code: 'ETSY_STATE_INVALID' });
    expect(ctx.tokenRequest).not.toHaveBeenCalled();
  });

  it('rejects a state started by a different user or organizer (callback bound to both)', async () => {
    const ctx = makeCtx({ env: { ...ENV, ETSY_ALLOWED_ORGANIZER_IDS: 'org_1,org_9' }, request: shopRequest() });
    const { state } = await startAndGetState(ctx);
    await expect(completeEtsyConnect({ organizerId: 'org_1', userId: 'user_OTHER', code: CODE, state }, ctx.deps)).rejects.toMatchObject({ code: 'ETSY_STATE_INVALID' });
    await expect(completeEtsyConnect({ organizerId: 'org_9', userId: 'user_1', code: CODE, state }, ctx.deps)).rejects.toMatchObject({ code: 'ETSY_STATE_INVALID' });
    expect(ctx.tokenRequest).not.toHaveBeenCalled();
    expect(ctx.db.store.accounts).toHaveLength(0);
  });

  it('rejects a missing or oversized code and a forged state without a token call', async () => {
    const ctx = makeCtx({ request: shopRequest() });
    const { state } = await startAndGetState(ctx);
    await expect(completeEtsyConnect({ organizerId: 'org_1', userId: 'user_1', code: undefined, state }, ctx.deps)).rejects.toMatchObject({ code: 'ETSY_STATE_INVALID' });
    await expect(completeEtsyConnect({ organizerId: 'org_1', userId: 'user_1', code: 'x'.repeat(5000), state }, ctx.deps)).rejects.toMatchObject({ code: 'ETSY_STATE_INVALID' });
    await expect(completeEtsyConnect({ organizerId: 'org_1', userId: 'user_1', code: CODE, state: 'forged-state-value-0000000000000000' }, ctx.deps)).rejects.toMatchObject({ code: 'ETSY_STATE_INVALID' });
    expect(ctx.tokenRequest).not.toHaveBeenCalled();
  });

  it('maps a failed token exchange to ETSY_TOKEN_EXCHANGE_FAILED and stores nothing', async () => {
    const ctx = makeCtx({ tokenRequest: async () => etsyResp(400, { error: 'invalid_grant' }), request: shopRequest() });
    const { state } = await startAndGetState(ctx);
    await expect(completeEtsyConnect({ organizerId: 'org_1', userId: 'user_1', code: CODE, state }, ctx.deps)).rejects.toMatchObject({ code: 'ETSY_TOKEN_EXCHANGE_FAILED' });
    expect(ctx.db.store.accounts).toHaveLength(0);
  });

  it('rejects a token without a numeric user id prefix', async () => {
    const ctx = makeCtx({ tokenRequest: async () => etsyResp(200, { ...NEW_TOKENS, access_token: 'nonumericprefixtoken' }), request: shopRequest() });
    const { state } = await startAndGetState(ctx);
    await expect(completeEtsyConnect({ organizerId: 'org_1', userId: 'user_1', code: CODE, state }, ctx.deps)).rejects.toMatchObject({ code: 'ETSY_TOKEN_EXCHANGE_FAILED' });
  });

  it('reports ETSY_NO_SHOP when the Etsy user has no shop', async () => {
    const ctx = makeCtx({ request: shopRequest(SHOP, 404) });
    const { state } = await startAndGetState(ctx);
    await expect(completeEtsyConnect({ organizerId: 'org_1', userId: 'user_1', code: CODE, state }, ctx.deps)).rejects.toMatchObject({ code: 'ETSY_NO_SHOP' });
    expect(ctx.db.store.accounts).toHaveLength(0);
  });

  it('refuses a shop already connected to a different organizer', async () => {
    const ctx = makeCtx({ request: shopRequest() });
    ctx.db.store.settings.push({ id: 's_other', organizerId: 'org_other', marketplaceAccountId: 'acct_other', shopId: '555' });
    const { state } = await startAndGetState(ctx);
    await expect(completeEtsyConnect({ organizerId: 'org_1', userId: 'user_1', code: CODE, state }, ctx.deps)).rejects.toMatchObject({ code: 'ETSY_SHOP_IN_USE' });
  });

  it('reconnect upserts over the existing row, returns it to ACTIVE and keeps defaults for the same shop', async () => {
    const ctx = makeCtx({ request: shopRequest() });
    seedAccount(ctx.db, { status: 'NEEDS_REAUTH', lastErrorMessage: 'old', lastErrorAt: NOW });
    seedSettings(ctx.db, { defaultShippingProfileId: '11', defaultReturnPolicyId: '21', defaultReadinessStateId: '31', receiptCursor: NOW });
    const { state } = await startAndGetState(ctx);
    await completeEtsyConnect({ organizerId: 'org_1', userId: 'user_1', code: CODE, state }, ctx.deps);
    expect(ctx.db.store.accounts).toHaveLength(1);
    expect(ctx.db.store.accounts[0]).toMatchObject({ id: 'acct_seed', status: 'ACTIVE', lastErrorMessage: null, lastErrorAt: null });
    expect(ctx.db.store.settings).toHaveLength(1);
    expect(ctx.db.store.settings[0]).toMatchObject({ defaultShippingProfileId: '11', defaultReturnPolicyId: '21', defaultReadinessStateId: '31' });
  });

  it('reconnecting a different shop resets the saved defaults and the poll cursor', async () => {
    const ctx = makeCtx({ request: shopRequest({ ...SHOP, shop_id: 777 }) });
    seedAccount(ctx.db, { status: 'NEEDS_REAUTH' });
    seedSettings(ctx.db, { defaultShippingProfileId: '11', defaultReturnPolicyId: '21', defaultReadinessStateId: '31', receiptCursor: NOW });
    const { state } = await startAndGetState(ctx);
    await completeEtsyConnect({ organizerId: 'org_1', userId: 'user_1', code: CODE, state }, ctx.deps);
    expect(ctx.db.store.settings[0]).toMatchObject({ shopId: '777', defaultShippingProfileId: null, defaultReturnPolicyId: null, defaultReadinessStateId: null, receiptCursor: null });
  });

  it('looks the shop up through the oauth endpoint class, sending the seller bearer token', async () => {
    const ctx = makeCtx({ request: shopRequest() });
    const { state } = await startAndGetState(ctx);
    await completeEtsyConnect({ organizerId: 'org_1', userId: 'user_1', code: CODE, state }, ctx.deps);
    expect(ctx.request).toHaveBeenCalledWith(expect.objectContaining({ method: 'GET', path: '/v3/application/users/1001/shops', priority: 'URGENT', endpointClass: 'oauth', organizerId: 'org_1' }));
    expect(ctx.request.mock.calls[0][0].accessToken).toBe(NEW_TOKENS.access_token);
  });

  it('extracts the Etsy user id from the access token prefix', () => {
    expect(etsyUserIdFromAccessToken('12345678.abcdef')).toBe('12345678');
    expect(etsyUserIdFromAccessToken('abcdef')).toBeNull();
    expect(etsyUserIdFromAccessToken('.abc')).toBeNull();
  });
});

describe('disconnectEtsyAccount', () => {
  function seedWithListings(db: any) {
    seedAccount(db);
    seedSettings(db);
    db.store.listings.push(
      { id: 'l1', organizerId: 'org_1', state: 'ACTIVE' },
      { id: 'l2', organizerId: 'org_1', state: 'DRAFT_READY' },
      { id: 'l3', organizerId: 'org_1', state: 'ENDED' },
      { id: 'l4', organizerId: 'org_1', state: 'FAILED' },
      { id: 'l5', organizerId: 'org_2', state: 'ACTIVE' }
    );
  }

  it('asks for confirmation (and changes nothing) when listings are live', async () => {
    const { db, deps } = makeCtx();
    seedWithListings(db);
    const res = await disconnectEtsyAccount({ organizerId: 'org_1', confirm: false }, deps);
    expect(res).toEqual({ disconnected: false, needsConfirm: true, activeListingCount: 2, orphanedListingCount: 0 });
    expect(db.store.accounts).toHaveLength(1);
    expect(db.store.listings.map((l: any) => l.state)).toEqual(['ACTIVE', 'DRAFT_READY', 'ENDED', 'FAILED', 'ACTIVE']);
  });

  it('with confirm deletes the account (cascading shop settings) and orphans remaining listings of that organizer only', async () => {
    const { db, deps } = makeCtx();
    seedWithListings(db);
    const res = await disconnectEtsyAccount({ organizerId: 'org_1', confirm: true }, deps);
    expect(res).toMatchObject({ disconnected: true, needsConfirm: false, activeListingCount: 2, orphanedListingCount: 3 });
    expect(db.store.accounts).toHaveLength(0);
    expect(db.store.settings).toHaveLength(0);
    expect(db.store.listings.map((l: any) => l.state)).toEqual(['ORPHANED', 'ORPHANED', 'ENDED', 'ORPHANED', 'ACTIVE']);
  });

  it('disconnects immediately when nothing is live', async () => {
    const { db, deps } = makeCtx();
    seedAccount(db);
    seedSettings(db);
    const res = await disconnectEtsyAccount({ organizerId: 'org_1', confirm: false }, deps);
    expect(res.disconnected).toBe(true);
    expect(db.store.accounts).toHaveLength(0);
  });
});

describe('getEtsyConnectionStatus (local state only)', () => {
  it('reports connected, shop, setup state, scopes and attribution without calling Etsy', async () => {
    const { db, deps, request, tokenRequest } = makeCtx();
    seedAccount(db);
    seedSettings(db, { defaultShippingProfileId: '11', defaultReturnPolicyId: '21', defaultReadinessStateId: '31' });
    const s = await getEtsyConnectionStatus('org_1', deps);
    expect(s).toMatchObject({
      enabled: true,
      pushEnabled: false,
      allowed: true,
      connected: true,
      status: 'ACTIVE',
      needsReauth: false,
      missingScopes: [],
      shopId: '555',
      shopName: 'Seed Shop',
      currencySupported: true,
      setupComplete: true,
      etsyBusy: false,
      retryAt: null,
      attribution: ETSY_ATTRIBUTION,
    });
    expect(request).not.toHaveBeenCalled();
    expect(tokenRequest).not.toHaveBeenCalled();
    expect(JSON.stringify(s)).not.toContain('OLDACCESSTOKEN');
    expect(JSON.stringify(s)).not.toContain('enc:v1:');
  });

  it('setupComplete needs only a shipping profile and a processing profile; the return policy is optional', async () => {
    const { db, deps } = makeCtx();
    seedAccount(db);
    seedSettings(db, { defaultShippingProfileId: '11', defaultReturnPolicyId: null, defaultReadinessStateId: '31' });
    expect(await getEtsyConnectionStatus('org_1', deps)).toMatchObject({ setupComplete: true, defaultReturnPolicyId: null });
    Object.assign(db.store.settings[0], { defaultShippingProfileId: null, defaultReturnPolicyId: '21', defaultReadinessStateId: '31' });
    expect(await getEtsyConnectionStatus('org_1', deps)).toMatchObject({ setupComplete: false });
    Object.assign(db.store.settings[0], { defaultShippingProfileId: '11', defaultReturnPolicyId: '21', defaultReadinessStateId: null });
    expect(await getEtsyConnectionStatus('org_1', deps)).toMatchObject({ setupComplete: false });
  });

  it('reports not connected, not allowed, and needs-reauth variants', async () => {
    const { db, deps } = makeCtx();
    expect(await getEtsyConnectionStatus('org_2', deps)).toMatchObject({ connected: false, status: null, allowed: false, setupComplete: false, shopId: null });
    seedAccount(db, { status: 'NEEDS_REAUTH', lastErrorMessage: 'Etsy rejected the refresh token' });
    expect(await getEtsyConnectionStatus('org_1', deps)).toMatchObject({ connected: false, status: 'NEEDS_REAUTH', needsReauth: true, lastError: 'Etsy rejected the refresh token' });
  });

  it('flags missing scopes, refresh expiry within 14 days, non-USD shops, push switch and an active budget block', async () => {
    const { db, deps } = makeCtx({ env: { ...ENV, ETSY_PUSH_ENABLED: 'true' } });
    seedAccount(db, { grantedScopes: 'listings_r shops_r', refreshTokenExpiresAt: new Date(NOW.getTime() + 10 * 24 * 3600_000) });
    seedSettings(db, { shopCurrency: 'EUR' });
    db.store.apiState = { id: 'global', blockedUntil: minutes(3), blockedReason: 'QPS' };
    const s = await getEtsyConnectionStatus('org_1', deps);
    expect(s.missingScopes).toEqual(['listings_w', 'listings_d', 'transactions_r']);
    expect(s.refreshExpiresSoon).toBe(true);
    expect(s.currencySupported).toBe(false);
    expect(s.pushEnabled).toBe(true);
    expect(s.etsyBusy).toBe(true);
    expect(s.retryAt).toEqual(minutes(3));
  });

  it('finds missing scopes', () => {
    expect(findMissingEtsyScopes(ETSY_SCOPE_STRING)).toEqual([]);
    expect(findMissingEtsyScopes(null)).toEqual([...ETSY_SCOPES]);
  });
});

describe('shop setup', () => {
  function setupRequest() {
    return async (opts: any) => {
      if (opts.path.endsWith('/shipping-profiles')) {
        return etsyResp(200, { count: 2, results: [{ shipping_profile_id: 11, title: 'Standard' }, { shipping_profile_id: 12, title: 'Old', is_deleted: true }] });
      }
      if (opts.path.endsWith('/policies/return')) {
        return etsyResp(200, { count: 1, results: [{ return_policy_id: 21, accepts_returns: true, accepts_exchanges: false, return_deadline: 30 }] });
      }
      if (opts.path.endsWith('/readiness-state-definitions')) {
        return etsyResp(200, { count: 1, results: [{ readiness_state_id: 31, readiness_state: 'ready_to_ship', processing_days_display_label: '1-2 business days' }] });
      }
      return etsyResp(404, {});
    };
  }

  function seedConnected(db: any) {
    seedAccount(db, { tokenExpiresAt: minutes(30) });
    seedSettings(db);
  }

  it('lists the organizer’s profiles, policies and processing profiles at INTERACTIVE priority', async () => {
    const { db, deps, request } = makeCtx({ request: setupRequest() });
    seedConnected(db);
    const options = await fetchEtsyShopSetupOptions('org_1', deps);
    expect(options.shippingProfiles).toEqual([{ id: '11', title: 'Standard' }]); // deleted profile hidden
    expect(options.returnPolicies).toEqual([{ id: '21', label: 'Returns accepted within 30 days' }]);
    expect(options.processingProfiles).toEqual([{ id: '31', label: '1-2 business days' }]);
    expect(options.needsEtsySideSetup).toBe(false);
    expect(request).toHaveBeenCalledTimes(3);
    for (const call of request.mock.calls) {
      expect(call[0]).toMatchObject({ method: 'GET', priority: 'INTERACTIVE', organizerId: 'org_1' });
      expect(call[0].path).toMatch(/^\/v3\/application\/shops\/555\//);
    }
  });

  it('flags an empty shop (no shipping or processing profiles)', async () => {
    const { db, deps } = makeCtx({ request: async () => etsyResp(200, { count: 0, results: [] }) });
    seedConnected(db);
    const options = await fetchEtsyShopSetupOptions('org_1', deps);
    expect(options.needsEtsySideSetup).toBe(true);
  });

  it('saves defaults validated against the freshly fetched lists', async () => {
    const { db, deps } = makeCtx({ request: setupRequest() });
    seedConnected(db);
    const res = await saveEtsyShopSetup({ organizerId: 'org_1', shippingProfileId: 11, returnPolicyId: '21', readinessStateId: '31' }, deps);
    expect(res).toEqual({ ok: true });
    expect(db.store.settings[0]).toMatchObject({ defaultShippingProfileId: '11', defaultReturnPolicyId: '21', defaultReadinessStateId: '31' });
  });

  it('treats the return policy as optional', async () => {
    const { db, deps } = makeCtx({ request: setupRequest() });
    seedConnected(db);
    expect(await saveEtsyShopSetup({ organizerId: 'org_1', shippingProfileId: '11', returnPolicyId: null, readinessStateId: '31' }, deps)).toEqual({ ok: true });
    expect(db.store.settings[0].defaultReturnPolicyId).toBeNull();
  });

  it.each([
    ['shipping id not in the shop', { shippingProfileId: '999', returnPolicyId: '21', readinessStateId: '31' }, 'shippingProfileId'],
    ['the deleted shipping profile', { shippingProfileId: '12', returnPolicyId: '21', readinessStateId: '31' }, 'shippingProfileId'],
    ['processing id not in the shop', { shippingProfileId: '11', returnPolicyId: '21', readinessStateId: '998' }, 'readinessStateId'],
    ['return policy not in the shop', { shippingProfileId: '11', returnPolicyId: '997', readinessStateId: '31' }, 'returnPolicyId'],
    ['an injection-shaped id', { shippingProfileId: '11; DROP TABLE', returnPolicyId: '21', readinessStateId: '31' }, 'shippingProfileId'],
    ['a missing shipping id', { shippingProfileId: undefined, returnPolicyId: '21', readinessStateId: '31' }, 'shippingProfileId'],
    ['a missing processing id', { shippingProfileId: '11', returnPolicyId: '21', readinessStateId: undefined }, 'readinessStateId'],
    ['a malformed return policy id', { shippingProfileId: '11', returnPolicyId: 'abc', readinessStateId: '31' }, 'returnPolicyId'],
  ])('rejects %s and saves nothing', async (_label, ids, field) => {
    const { db, deps } = makeCtx({ request: setupRequest() });
    seedConnected(db);
    const res = await saveEtsyShopSetup({ organizerId: 'org_1', ...ids }, deps);
    expect(res).toEqual({ ok: false, field });
    expect(db.store.settings[0].defaultShippingProfileId).toBeNull();
  });

  it('requires a connected shop', async () => {
    const { db, deps } = makeCtx({ request: setupRequest() });
    seedAccount(db, { tokenExpiresAt: minutes(30) }); // account but no settings row
    await expect(fetchEtsyShopSetupOptions('org_1', deps)).rejects.toMatchObject({ code: 'ETSY_NOT_CONNECTED' });
  });

  it('surfaces an upstream failure as ETSY_UPSTREAM', async () => {
    const { db, deps } = makeCtx({ request: async () => etsyResp(500, {}) });
    seedConnected(db);
    await expect(fetchEtsyShopSetupOptions('org_1', deps)).rejects.toMatchObject({ code: 'ETSY_UPSTREAM' });
  });
});
