/**
 * etsyConnectController.ts -- ADR-135 batch B1, controller half of acceptance items 6 and 7
 * (kill switch, tier gate, error mapping that never leaks) plus the HTTP behaviour of every handler.
 * Handlers are built with makeEtsyConnectHandlers(deps): fake db, injected env, token endpoint and API,
 * reversible fake crypto. Nothing touches Etsy, a database or a real key.
 */

jest.mock('@sentry/node', () => ({ captureMessage: jest.fn() }));

import {
  ETSY_MESSAGES,
  confirmDisconnectMessage,
  currencyUnsupportedMessage,
  makeEtsyConnectHandlers,
  mapEtsyError,
} from '../etsyConnectController';
import { EtsyError } from '../../services/marketplace/etsyBudget';
import type { EtsyErrorCode } from '../../services/marketplace/etsyBudget';
import { ETSY_SCOPE_STRING } from '../../services/marketplace/etsyOAuthState';
import { etsyResp, fakeTokenCrypto, makeEtsyFakeDb } from '../../services/marketplace/__tests__/etsyFakeDb';

const NOW = new Date('2026-10-03T12:00:00.000Z');
const ENV = {
  ETSY_CONNECTOR_ENABLED: 'true',
  ETSY_API_KEY: 'KEYSTRING',
  ETSY_SHARED_SECRET: 'SHAREDSECRET',
  ETSY_ACCESS_TIER: 'personal',
  ETSY_ALLOWED_ORGANIZER_IDS: 'org_1',
  FRONTEND_URL: 'https://finda.sale',
};

const GOOD_TOKENS = {
  access_token: '1001.ACCESSTOKEN00000000000',
  refresh_token: '1001.REFRESHTOKEN0000000000',
  expires_in: 3600,
  token_type: 'Bearer',
  scope: ETSY_SCOPE_STRING,
};

function fakeRes() {
  const res: any = { statusCode: 200, body: undefined as any };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body: any) => {
    res.body = body;
    return res;
  };
  return res;
}

function makeHarness(over: { env?: Record<string, string | undefined>; tokenRequest?: any; request?: any; organizers?: Record<string, string> } = {}) {
  const db = makeEtsyFakeDb();
  const organizers = over.organizers ?? { user_1: 'org_1', user_2: 'org_2' };
  const tokenRequest = jest.fn(over.tokenRequest ?? (async () => etsyResp(200, GOOD_TOKENS)));
  const request = jest.fn(
    over.request ??
      (async (opts: any) => {
        if (opts.path === '/v3/application/users/1001/shops') {
          return etsyResp(200, { shop_id: 555, shop_name: 'Vintage Corner', currency_code: 'USD', user_id: 1001 });
        }
        return etsyResp(404, {});
      })
  );
  const handlers = makeEtsyConnectHandlers({
    db,
    env: over.env ?? ENV,
    now: () => NOW,
    sleep: () => Promise.resolve(),
    crypto: fakeTokenCrypto,
    tokenRequest: tokenRequest as any,
    request: request as any,
    resolveOrganizerId: async (userId: string) => organizers[userId] ?? null,
  });
  return { db, handlers, tokenRequest, request };
}

const asUser = (id: string | undefined, extra: Record<string, any> = {}): any => ({
  user: id ? { id } : undefined,
  body: {},
  query: {},
  ...extra,
});

async function run(handler: (req: any, res: any) => Promise<void>, req: any) {
  const res = fakeRes();
  await handler(req, res);
  return res;
}

describe('etsyKillSwitch (acceptance 6)', () => {
  it('answers 503 { code: ETSY_DISABLED, enabled: false } and does not call next when the flag is off or not exactly true', async () => {
    for (const value of [undefined, '', 'false', '1', 'TRUE', 'yes', ' true']) {
      const { handlers } = makeHarness({ env: { ...ENV, ETSY_CONNECTOR_ENABLED: value } });
      const res = fakeRes();
      const next = jest.fn();
      handlers.etsyKillSwitch({} as any, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(503);
      expect(res.body).toMatchObject({ code: 'ETSY_DISABLED', enabled: false, message: ETSY_MESSAGES.disabled });
    }
  });

  it('calls next only when the flag is exactly true', () => {
    const { handlers } = makeHarness();
    const res = fakeRes();
    const next = jest.fn();
    handlers.etsyKillSwitch({} as any, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.body).toBeUndefined();
  });

  it('reads the env on every request, never at import', () => {
    const env: Record<string, string | undefined> = { ...ENV, ETSY_CONNECTOR_ENABLED: 'false' };
    const { handlers } = makeHarness({ env });
    const off = fakeRes();
    handlers.etsyKillSwitch({} as any, off, jest.fn());
    expect(off.statusCode).toBe(503);
    env.ETSY_CONNECTOR_ENABLED = 'true';
    const next = jest.fn();
    handlers.etsyKillSwitch({} as any, fakeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('organizer resolution', () => {
  const names = ['connect', 'callback', 'getConnection', 'disconnect', 'getShopSetup', 'putShopSetup'] as const;

  it.each(names)('%s answers 401 when there is no authenticated user and touches nothing', async (name) => {
    const { handlers, db, tokenRequest, request } = makeHarness();
    const res = await run(handlers[name] as any, asUser(undefined));
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ message: ETSY_MESSAGES.authRequired });
    expect(db.store.states).toHaveLength(0);
    expect(tokenRequest).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it.each(names)('%s answers 404 when the user has no organizer profile', async (name) => {
    const { handlers, tokenRequest, request } = makeHarness();
    const res = await run(handlers[name] as any, asUser('user_without_profile'));
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ message: ETSY_MESSAGES.organizerMissing });
    expect(tokenRequest).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it('ignores any organizer id the client sends: the organizer always comes from the user', async () => {
    const { handlers, db } = makeHarness();
    const res = await run(handlers.connect, asUser('user_1', { body: { organizerId: 'org_2' }, query: { organizerId: 'org_2' } }));
    expect(res.statusCode).toBe(200);
    expect(db.store.states).toHaveLength(1);
    expect(db.store.states[0]).toMatchObject({ organizerId: 'org_1', userId: 'user_1' });
  });
});

describe('connect and the personal-tier allowlist (acceptance 7)', () => {
  it('returns only { authorizeUrl } for an allowlisted organizer, with PKCE S256 and the requested scopes', async () => {
    const { handlers } = makeHarness();
    const res = await run(handlers.connect, asUser('user_1'));
    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.body)).toEqual(['authorizeUrl']);
    const url = new URL(res.body.authorizeUrl);
    expect(url.origin + url.pathname).toBe('https://www.etsy.com/oauth/connect');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('KEYSTRING');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toBe(ETSY_SCOPE_STRING);
    expect(url.searchParams.get('redirect_uri')).toBe('https://finda.sale/organizer/etsy-oauth-callback');
    expect(res.body.authorizeUrl).not.toContain('SHAREDSECRET');
  });

  it('answers 403 ETSY_NOT_ALLOWED for an organizer that is not on the allowlist and writes no state row', async () => {
    const { handlers, db } = makeHarness();
    const res = await run(handlers.connect, asUser('user_2'));
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ code: 'ETSY_NOT_ALLOWED', message: ETSY_MESSAGES.notAllowed });
    expect(db.store.states).toHaveLength(0);
  });

  it('answers 403 for everyone when the allowlist is empty under the personal tier', async () => {
    const { handlers } = makeHarness({ env: { ...ENV, ETSY_ALLOWED_ORGANIZER_IDS: '' } });
    const res = await run(handlers.connect, asUser('user_1'));
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('ETSY_NOT_ALLOWED');
  });

  it('lets any organizer connect under the commercial tier, ignoring the allowlist', async () => {
    const { handlers } = makeHarness({ env: { ...ENV, ETSY_ACCESS_TIER: 'commercial', ETSY_ALLOWED_ORGANIZER_IDS: '' } });
    const res = await run(handlers.connect, asUser('user_2'));
    expect(res.statusCode).toBe(200);
    expect(typeof res.body.authorizeUrl).toBe('string');
  });

  it('answers 503 ETSY_DISABLED when the key is not configured', async () => {
    const { handlers } = makeHarness({ env: { ...ENV, ETSY_API_KEY: '' } });
    const res = await run(handlers.connect, asUser('user_1'));
    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({ code: 'ETSY_DISABLED', enabled: false });
  });
});

describe('callback', () => {
  const CODE = 'authcode-0123456789';

  async function start(h: ReturnType<typeof makeHarness>, userId = 'user_1') {
    const res = await run(h.handlers.connect, asUser(userId));
    return new URL(res.body.authorizeUrl).searchParams.get('state')!;
  }

  it('connects the shop and returns the shop, currency flag and attribution, never a token', async () => {
    const h = makeHarness();
    const state = await start(h);
    const res = await run(h.handlers.callback, asUser('user_1', { body: { code: CODE, state } }));
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      connected: true,
      shopId: '555',
      shopName: 'Vintage Corner',
      shopCurrency: 'USD',
      currencySupported: true,
      attribution: ETSY_MESSAGES.attribution,
    });
    expect(res.body).not.toHaveProperty('currencyMessage');
    const serialised = JSON.stringify(res.body);
    expect(serialised).not.toContain('ACCESSTOKEN');
    expect(serialised).not.toContain('REFRESHTOKEN');
    expect(h.db.store.accounts).toHaveLength(1);
  });

  it('flags a non-USD shop with the fixed currency message', async () => {
    const h = makeHarness({
      request: async (opts: any) =>
        opts.path === '/v3/application/users/1001/shops'
          ? etsyResp(200, { shop_id: 555, shop_name: 'Boutique', currency_code: 'EUR', user_id: 1001 })
          : etsyResp(404, {}),
    });
    const state = await start(h);
    const res = await run(h.handlers.callback, asUser('user_1', { body: { code: CODE, state } }));
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ currencySupported: false, currencyMessage: currencyUnsupportedMessage('EUR') });
  });

  it('gives an identical generic answer for a bad state and for a failed code exchange', async () => {
    const bad = makeHarness();
    await start(bad);
    const badState = await run(bad.handlers.callback, asUser('user_1', { body: { code: CODE, state: 'not-a-real-state' } }));

    const failed = makeHarness({ tokenRequest: async () => etsyResp(400, { error: 'invalid_grant', error_description: 'code expired for SECRETDETAIL' }) });
    const goodState = await start(failed);
    const badExchange = await run(failed.handlers.callback, asUser('user_1', { body: { code: CODE, state: goodState } }));

    expect(badState.statusCode).toBe(400);
    expect(badExchange.statusCode).toBe(400);
    expect(badState.body).toEqual(badExchange.body);
    expect(badState.body).toEqual({ code: 'ETSY_CONNECT_FAILED', message: ETSY_MESSAGES.connectFailed });
    expect(JSON.stringify(badExchange.body)).not.toContain('SECRETDETAIL');
    expect(failed.db.store.accounts).toHaveLength(0);
    expect(bad.tokenRequest).not.toHaveBeenCalled();
  });

  it('rejects a missing or malformed body with the same generic answer', async () => {
    const h = makeHarness();
    await start(h);
    for (const body of [undefined, {}, { code: 5, state: 'x' }, { code: CODE }, { state: 'x' }]) {
      const res = await run(h.handlers.callback, asUser('user_1', { body }));
      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ code: 'ETSY_CONNECT_FAILED', message: ETSY_MESSAGES.connectFailed });
    }
    expect(h.tokenRequest).not.toHaveBeenCalled();
  });

  it('answers 422 when the Etsy account has no shop, and 409 when the shop belongs to another account', async () => {
    const noShop = makeHarness({ request: async () => etsyResp(404, {}) });
    const s1 = await start(noShop);
    const r1 = await run(noShop.handlers.callback, asUser('user_1', { body: { code: CODE, state: s1 } }));
    expect(r1.statusCode).toBe(422);
    expect(r1.body).toEqual({ code: 'ETSY_NO_SHOP', message: ETSY_MESSAGES.noShop });

    const taken = makeHarness();
    taken.db.store.settings.push({ id: 's_other', organizerId: 'org_9', marketplaceAccountId: 'a_other', shopId: '555' });
    const s2 = await start(taken);
    const r2 = await run(taken.handlers.callback, asUser('user_1', { body: { code: CODE, state: s2 } }));
    expect(r2.statusCode).toBe(409);
    expect(r2.body).toEqual({ code: 'ETSY_SHOP_IN_USE', message: ETSY_MESSAGES.shopInUse });
  });

  it('refuses a callback from a user who did not start the flow', async () => {
    const h = makeHarness({ env: { ...ENV, ETSY_ALLOWED_ORGANIZER_IDS: 'org_1,org_2' } });
    const state = await start(h, 'user_1');
    const res = await run(h.handlers.callback, asUser('user_2', { body: { code: CODE, state } }));
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('ETSY_CONNECT_FAILED');
    expect(h.tokenRequest).not.toHaveBeenCalled();
  });
});

describe('disconnect', () => {
  function seed(db: any) {
    db.store.accounts.push({ id: 'acct_1', organizerId: 'org_1', platform: 'ETSY', status: 'ACTIVE' });
    db.store.settings.push({ id: 'set_1', organizerId: 'org_1', marketplaceAccountId: 'acct_1', shopId: '555' });
    db.store.listings.push(
      { id: 'l1', organizerId: 'org_1', state: 'ACTIVE' },
      { id: 'l2', organizerId: 'org_1', state: 'DRAFT_READY' },
      { id: 'l3', organizerId: 'org_1', state: 'ENDED' }
    );
  }

  it('answers 409 with activeListingCount until confirmed, and changes nothing', async () => {
    const h = makeHarness();
    seed(h.db);
    const res = await run(h.handlers.disconnect, asUser('user_1'));
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ code: 'ETSY_CONFIRM_REQUIRED', activeListingCount: 2, message: confirmDisconnectMessage(2) });
    expect(h.db.store.accounts).toHaveLength(1);
  });

  it('only a query value of exactly "true" confirms', async () => {
    const h = makeHarness();
    seed(h.db);
    for (const confirm of ['1', 'TRUE', 'yes', '']) {
      const res = await run(h.handlers.disconnect, asUser('user_1', { query: { confirm } }));
      expect(res.statusCode).toBe(409);
    }
    expect(h.db.store.accounts).toHaveLength(1);
  });

  it('with confirm=true removes the connection, orphans the listings and returns the fixed notice', async () => {
    const h = makeHarness();
    seed(h.db);
    const res = await run(h.handlers.disconnect, asUser('user_1', { query: { confirm: 'true' } }));
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, disconnected: true, orphanedListingCount: 2, notice: ETSY_MESSAGES.disconnectNotice });
    expect(h.db.store.accounts).toHaveLength(0);
  });

  it('never touches another organizer\'s connection', async () => {
    const h = makeHarness();
    seed(h.db);
    const res = await run(h.handlers.disconnect, asUser('user_2', { query: { confirm: 'true' } }));
    expect(res.statusCode).toBe(200);
    expect(h.db.store.accounts).toHaveLength(1);
  });

  it('confirmDisconnectMessage uses singular and plural correctly', () => {
    expect(confirmDisconnectMessage(1)).toContain('1 Etsy listing is live');
    expect(confirmDisconnectMessage(3)).toContain('3 Etsy listings are live');
  });
});

describe('getConnection and shop setup', () => {
  it('reports local connection state with no Etsy call and no token fields', async () => {
    const h = makeHarness();
    h.db.store.accounts.push({
      id: 'acct_1',
      organizerId: 'org_1',
      platform: 'ETSY',
      status: 'ACTIVE',
      accessToken: fakeTokenCrypto.encrypt('1001.SECRETACCESS'),
      refreshToken: fakeTokenCrypto.encrypt('1001.SECRETREFRESH'),
      grantedScopes: ETSY_SCOPE_STRING,
      externalShopId: '555',
      refreshTokenExpiresAt: new Date(NOW.getTime() + 80 * 24 * 3600_000),
    });
    h.db.store.settings.push({ id: 'set_1', organizerId: 'org_1', marketplaceAccountId: 'acct_1', shopId: '555', shopName: 'Vintage Corner', shopCurrency: 'GBP' });
    const res = await run(h.handlers.getConnection, asUser('user_1'));
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ enabled: true, connected: true, shopId: '555', currencySupported: false, currencyMessage: currencyUnsupportedMessage('GBP') });
    const serialised = JSON.stringify(res.body);
    expect(serialised).not.toContain('SECRET');
    expect(serialised).not.toContain('enc:v1:');
    expect(h.request).not.toHaveBeenCalled();
    expect(h.tokenRequest).not.toHaveBeenCalled();
  });

  it('reports not connected for an organizer with no account', async () => {
    const h = makeHarness();
    const res = await run(h.handlers.getConnection, asUser('user_1'));
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ connected: false, status: null, shopId: null });
  });

  it('shop-setup GET answers 404 ETSY_NOT_CONNECTED before any connection', async () => {
    const h = makeHarness();
    const res = await run(h.handlers.getShopSetup, asUser('user_1'));
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ code: 'ETSY_NOT_CONNECTED', message: ETSY_MESSAGES.notConnected });
  });

  it('shop-setup PUT rejects ids that are not digits with 400 ETSY_SETUP_INVALID and names the field', async () => {
    const h = makeHarness();
    const res = await run(
      h.handlers.putShopSetup,
      asUser('user_1', { body: { defaultShippingProfileId: "1; DROP TABLE", defaultReadinessStateId: '31' } })
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ code: 'ETSY_SETUP_INVALID', field: 'shippingProfileId', message: ETSY_MESSAGES.setupInvalid });
    expect(h.request).not.toHaveBeenCalled();
  });
});

describe('mapEtsyError never leaks internal text', () => {
  const codes: EtsyErrorCode[] = [
    'ETSY_DISABLED',
    'ETSY_NOT_CONFIGURED',
    'ETSY_NOT_ALLOWED',
    'ETSY_BAD_REQUEST',
    'ETSY_BUDGET',
    'ETSY_BLOCKED',
    'ETSY_BUSY',
    'ETSY_NETWORK',
    'ETSY_NEEDS_REAUTH',
    'ETSY_NOT_CONNECTED',
    'ETSY_REFRESH_BUSY',
    'ETSY_REFRESH_FAILED',
    'ETSY_STATE_INVALID',
    'ETSY_TOKEN_EXCHANGE_FAILED',
    'ETSY_NO_SHOP',
    'ETSY_SHOP_IN_USE',
    'ETSY_UPSTREAM',
  ];

  it.each(codes)('%s maps to a fixed message that does not contain the internal message', (code) => {
    const mapped = mapEtsyError(new EtsyError(code, 'INTERNAL-DETAIL access_token=1001.LEAKME'));
    expect(JSON.stringify(mapped)).not.toContain('INTERNAL-DETAIL');
    expect(JSON.stringify(mapped)).not.toContain('LEAKME');
    expect(Object.values(ETSY_MESSAGES)).toContain(mapped.message);
    expect(mapped.httpStatus).toBeGreaterThanOrEqual(400);
  });

  it('maps the connector and budget outcomes to the documented statuses', () => {
    expect(mapEtsyError(new EtsyError('ETSY_DISABLED', 'x'))).toMatchObject({ httpStatus: 503, code: 'ETSY_DISABLED' });
    expect(mapEtsyError(new EtsyError('ETSY_NOT_ALLOWED', 'x'))).toMatchObject({ httpStatus: 403, code: 'ETSY_NOT_ALLOWED' });
    expect(mapEtsyError(new EtsyError('ETSY_NEEDS_REAUTH', 'x'))).toMatchObject({ httpStatus: 409, code: 'ETSY_NEEDS_REAUTH' });
    for (const code of ['ETSY_BUDGET', 'ETSY_BLOCKED', 'ETSY_BUSY', 'ETSY_REFRESH_BUSY'] as EtsyErrorCode[]) {
      expect(mapEtsyError(new EtsyError(code, 'x'))).toMatchObject({ httpStatus: 503, code: 'ETSY_BUSY' });
    }
    for (const code of ['ETSY_STATE_INVALID', 'ETSY_TOKEN_EXCHANGE_FAILED'] as EtsyErrorCode[]) {
      expect(mapEtsyError(new EtsyError(code, 'x'))).toEqual({ httpStatus: 400, code: 'ETSY_CONNECT_FAILED', message: ETSY_MESSAGES.connectFailed });
    }
  });

  it('turns an unknown thrown value into a 500 with the generic message, and never echoes it', () => {
    const mapped = mapEtsyError(new Error('connect ECONNREFUSED 10.0.0.1 token=1001.LEAKME'));
    expect(mapped).toEqual({ httpStatus: 500, code: 'ETSY_ERROR', message: ETSY_MESSAGES.generic });
    expect(mapEtsyError('a string')).toEqual({ httpStatus: 500, code: 'ETSY_ERROR', message: ETSY_MESSAGES.generic });
    expect(mapEtsyError(null)).toEqual({ httpStatus: 500, code: 'ETSY_ERROR', message: ETSY_MESSAGES.generic });
  });

  it('a handler that hits an unexpected error answers the generic body and logs only the error name', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const h = makeHarness();
      h.db.etsyShopSettings.findUnique = async () => {
        throw new Error('db exploded with token=1001.LEAKME');
      };
      const res = await run(h.handlers.getShopSetup, asUser('user_1'));
      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ code: 'ETSY_ERROR', message: ETSY_MESSAGES.generic });
      const logged = spy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
      expect(logged).not.toContain('LEAKME');
    } finally {
      spy.mockRestore();
    }
  });

  it('includes retryAt for a blocked response so the UI can say when to try again', () => {
    const retryAt = new Date('2026-10-03T13:00:00Z');
    const mapped = mapEtsyError(new EtsyError('ETSY_BLOCKED', 'x', { retryAt }));
    expect(mapped.retryAt).toEqual(retryAt);
  });
});

describe('organizer-facing copy lint', () => {
  const samples = (): string[] => [
    ...Object.values(ETSY_MESSAGES),
    currencyUnsupportedMessage('EUR'),
    currencyUnsupportedMessage('GBP'),
    confirmDisconnectMessage(1),
    confirmDisconnectMessage(7),
  ];

  it('has no em dash, no standalone "AI" and no "estate sale"', () => {
    for (const text of samples()) {
      expect(text).not.toMatch(/\u2014/);
      expect(text).not.toMatch(/\bAI\b/);
      expect(text).not.toMatch(/estate sale/i);
    }
  });

  it('has no first-person founder voice', () => {
    for (const text of samples()) {
      expect(text).not.toMatch(/\b(I'm|I am|I built|my story|as a founder)\b/i);
    }
  });

  it('every message is non-empty plain text', () => {
    for (const text of samples()) {
      expect(typeof text).toBe('string');
      expect(text.trim().length).toBeGreaterThan(0);
    }
  });
});
