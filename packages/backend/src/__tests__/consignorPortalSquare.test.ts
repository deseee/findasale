/**
 * Consignor portal Square connect (2026-10-06): signed state variants in services/squareConnectService.ts
 * and the first-connect-only portal flow in services/consignorSquareConnectService.ts.
 *
 * NOT EXECUTED when written (no jest in the build sandbox). Run
 * `pnpm --filter backend test consignorPortalSquare` before merging.
 *
 * The square SDK, Prisma and the email service are mocks: no network call, no real Square account,
 * no database and no email. Real HMAC signing runs with a throwaway JWT_SECRET.
 */
process.env.JWT_SECRET = 'test-jwt-square-state';
process.env.SQUARE_ENVIRONMENT = 'sandbox';
process.env.SQUARE_SANDBOX_APPLICATION_ID = 'sandbox-app-id';
process.env.SQUARE_SANDBOX_APPLICATION_SECRET = 'sandbox-app-secret';

const mockObtainToken = jest.fn();
const mockMerchantsList = jest.fn();
const mockBankAccountsList = jest.fn();

jest.mock('square', () => ({
  SquareEnvironment: { Production: 'production', Sandbox: 'sandbox' },
  SquareClient: jest.fn().mockImplementation(() => ({
    oAuth: { obtainToken: mockObtainToken },
    merchants: { list: mockMerchantsList },
    bankAccounts: { list: mockBankAccountsList },
  })),
}));
jest.mock('@sentry/node', () => ({ captureMessage: jest.fn(), captureException: jest.fn() }));
jest.mock('../services/notificationService', () => ({ createNotification: jest.fn() }));
jest.mock('../utils/tokenCrypto', () => ({
  encryptToken: jest.fn((v: string) => `enc:v1:${v}`),
  decryptToken: jest.fn((v: string) => v.replace(/^enc:v1:/, '')),
}));
jest.mock('../services/consignorEmailService', () => ({
  sendConsignorSquareConnectedNotice: jest.fn().mockResolvedValue({ sent: true }),
  sendOrganizerConsignorSquareConnectedNotice: jest.fn().mockResolvedValue({ sent: true }),
}));

// Minimal in-memory Prisma: consignor, organizer, vendorBooth, connectBankFingerprint, user.
jest.mock('../lib/prisma', () => {
  const store: Record<string, any[]> = { consignor: [], organizer: [], vendorBooth: [], connectBankFingerprint: [], user: [] };
  const match = (row: any, where: any): boolean => {
    if (!where) return true;
    return Object.entries(where).every(([k, v]: [string, any]) => {
      if (k === 'OR') return (v as any[]).some((w) => match(row, w));
      if (k === 'NOT') return !match(row, v);
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        if ('not' in v) return row[k] !== v.not;
        if ('in' in v) return v.in.includes(row[k]);
        if ('has' in v) return Array.isArray(row[k]) && row[k].includes(v.has);
        return true;
      }
      return (row[k] ?? null) === v;
    });
  };
  const model = (t: string) => ({
    findUnique: jest.fn(async (a: any) => store[t].find((r) => match(r, a.where)) ?? null),
    findFirst: jest.fn(async (a: any) => store[t].find((r) => match(r, a?.where)) ?? null),
    findMany: jest.fn(async (a: any) => store[t].filter((r) => match(r, a?.where))),
    update: jest.fn(async (a: any) => {
      const r = store[t].find((x) => match(x, a.where));
      if (!r) throw new Error(`${t} not found`);
      Object.assign(r, a.data);
      return r;
    }),
    updateMany: jest.fn(async (a: any) => {
      const rows = store[t].filter((x) => match(x, a.where));
      rows.forEach((r) => Object.assign(r, a.data));
      return { count: rows.length };
    }),
    upsert: jest.fn(async (a: any) => {
      store[t].push({ id: `fp_${store[t].length + 1}`, ...a.create });
      return a.create;
    }),
  });
  return {
    prisma: {
      __store: store,
      consignor: model('consignor'),
      organizer: model('organizer'),
      vendorBooth: model('vendorBooth'),
      connectBankFingerprint: model('connectBankFingerprint'),
      user: model('user'),
    },
  };
});

import { createHmac } from 'crypto';
import { prisma } from '../lib/prisma';
import {
  buildSquareAuthorizeUrl,
  buildSquarePortalAuthorizeUrl,
  decodeSquareOAuthState,
  decodeSquarePortalOAuthState,
  encodeSquareOAuthState,
  encodeSquarePortalOAuthState,
  hashSquarePortalNonce,
  recordAndCheckSquareBankFingerprints,
  SQUARE_PORTAL_OAUTH_STATE_MAX_AGE_MS,
} from '../services/squareConnectService';
import {
  completePortalSquareConnection,
  getPortalSquareStatus,
  persistConsignorSquareConnection,
  PortalSquareError,
  refreshPortalSquareStatus,
  startPortalSquareConnection,
} from '../services/consignorSquareConnectService';
import { sendConsignorSquareConnectedNotice, sendOrganizerConsignorSquareConnectedNotice } from '../services/consignorEmailService';

const store = (prisma as any).__store as Record<string, any[]>;

function seedConsignor(over: any = {}) {
  const c = {
    id: `con_${store.consignor.length + 1}`,
    name: 'Lucy',
    email: 'lucy@maplemail.net',
    portalToken: `tok_${store.consignor.length + 1}`,
    squareAccountId: null,
    squareOnboarded: false,
    squareAccessTokenEncrypted: null,
    squareRefreshTokenEncrypted: null,
    squareTokenExpiresAt: null,
    squarePortalOAuthNonce: null,
    payoutsFlaggedForReview: false,
    payoutsFlaggedReason: null,
    ...over,
  };
  store.consignor.push(c);
  return c;
}

function stateFromUrl(url: string): string {
  return new URL(url).searchParams.get('state') as string;
}

/** Re-sign an arbitrary payload with the real derived key (to test payload validation, not signature). */
function signPayload(payload: any): string {
  const key = createHmac('sha256', process.env.JWT_SECRET as string).update('square-oauth-state-v1').digest();
  const p = JSON.stringify(payload);
  const s = createHmac('sha256', key).update(p).digest('base64url');
  return Buffer.from(JSON.stringify({ p, s }), 'utf8').toString('base64url');
}

function squareReturns(merchantId: string, status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE') {
  mockObtainToken.mockResolvedValue({ accessToken: `at_${merchantId}`, refreshToken: `rt_${merchantId}`, expiresAt: '2099-01-01T00:00:00Z', merchantId });
  mockMerchantsList.mockResolvedValue({ data: [{ id: merchantId, mainLocationId: 'loc1', status }] });
}

async function expectPortalError(p: Promise<unknown>, status: number, code: string) {
  await expect(p).rejects.toBeInstanceOf(PortalSquareError);
  await p.catch((e: any) => {
    expect(e.status).toBe(status);
    expect(e.code).toBe(code);
  });
}

beforeEach(() => {
  for (const k of Object.keys(store)) store[k].length = 0;
  mockObtainToken.mockReset();
  mockMerchantsList.mockReset();
  mockBankAccountsList.mockReset().mockReturnValue((async function* () {})());
  (sendConsignorSquareConnectedNotice as jest.Mock).mockClear();
  (sendOrganizerConsignorSquareConnectedNotice as jest.Mock).mockClear();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('state variants', () => {
  it('organizer state round-trips and keeps its userId binding', () => {
    const s = encodeSquareOAuthState('CONSIGNOR', 'con_1', 'user_org');
    expect(decodeSquareOAuthState(s)).toMatchObject({ ownerType: 'CONSIGNOR', ownerId: 'con_1', userId: 'user_org' });
  });

  it('portal state round-trips', () => {
    const { state, nonce } = encodeSquarePortalOAuthState('con_1');
    expect(decodeSquarePortalOAuthState(state)).toEqual({ via: 'PORTAL', ownerType: 'CONSIGNOR', ownerId: 'con_1', nonce, ts: expect.any(Number) });
  });

  it('wrong variant: the organizer decoder rejects a portal state, the portal decoder rejects an organizer state', () => {
    const portal = encodeSquarePortalOAuthState('con_1').state;
    const organizer = encodeSquareOAuthState('CONSIGNOR', 'con_1', 'user_org');
    expect(decodeSquareOAuthState(portal)).toBeNull();
    expect(decodeSquarePortalOAuthState(organizer)).toBeNull();
  });

  it('forged: a tampered payload or a signature from another key is rejected', () => {
    const { state } = encodeSquarePortalOAuthState('con_1');
    const env = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    const tampered = JSON.parse(env.p);
    tampered.ownerId = 'con_victim';
    const forged = Buffer.from(JSON.stringify({ p: JSON.stringify(tampered), s: env.s }), 'utf8').toString('base64url');
    expect(decodeSquarePortalOAuthState(forged)).toBeNull();
    const otherKey = createHmac('sha256', 'attacker-key').update(env.p).digest('base64url');
    expect(decodeSquarePortalOAuthState(Buffer.from(JSON.stringify({ p: env.p, s: otherKey })).toString('base64url'))).toBeNull();
    expect(decodeSquarePortalOAuthState('not-base64-json')).toBeNull();
    expect(decodeSquarePortalOAuthState('')).toBeNull();
  });

  it('a signed portal payload carrying a userId, a non-CONSIGNOR owner, or no nonce is rejected', () => {
    const base = { via: 'PORTAL', ownerType: 'CONSIGNOR', ownerId: 'con_1', nonce: 'n', ts: Date.now() };
    expect(decodeSquarePortalOAuthState(signPayload(base))).not.toBeNull();
    expect(decodeSquarePortalOAuthState(signPayload({ ...base, userId: 'u' }))).toBeNull();
    expect(decodeSquarePortalOAuthState(signPayload({ ...base, ownerType: 'ORGANIZER' }))).toBeNull();
    expect(decodeSquarePortalOAuthState(signPayload({ ...base, nonce: '' }))).toBeNull();
    // and an organizer-shaped payload with `via` added is rejected by the organizer decoder
    expect(decodeSquareOAuthState(signPayload({ ownerType: 'CONSIGNOR', ownerId: 'c', userId: 'u', nonce: 'n', ts: Date.now(), via: 'PORTAL' }))).toBeNull();
  });

  it('expired: a portal state older than the TTL (and the TTL is at most 30 minutes) is rejected', () => {
    expect(SQUARE_PORTAL_OAUTH_STATE_MAX_AGE_MS).toBeLessThanOrEqual(30 * 60 * 1000);
    const old = signPayload({ via: 'PORTAL', ownerType: 'CONSIGNOR', ownerId: 'con_1', nonce: 'n', ts: Date.now() - SQUARE_PORTAL_OAUTH_STATE_MAX_AGE_MS - 1000 });
    expect(decodeSquarePortalOAuthState(old)).toBeNull();
  });

  it('both authorize URLs force a fresh Square sign in (session=false) and carry the state', () => {
    const org = buildSquareAuthorizeUrl('CONSIGNOR', 'con_1', 'user_org');
    const portal = buildSquarePortalAuthorizeUrl('con_1');
    for (const built of [org, portal]) {
      const u = new URL(built.url);
      expect(u.origin).toBe('https://connect.squareupsandbox.com');
      expect(u.pathname).toBe('/oauth2/authorize');
      expect(u.searchParams.get('session')).toBe('false');
      expect(u.searchParams.get('client_id')).toBe('sandbox-app-id');
      expect(u.searchParams.get('scope')).toContain('MERCHANT_PROFILE_READ');
      expect(u.searchParams.get('state')).toBe(built.state);
    }
  });

  it('portal authorize URL requests ONLY the minimal scopes; organizer scopes are unchanged', () => {
    const portalScopes = (new URL(buildSquarePortalAuthorizeUrl('con_1').url).searchParams.get('scope') || '').split(' ');
    expect(portalScopes.sort()).toEqual(['BANK_ACCOUNTS_READ', 'MERCHANT_PROFILE_READ']);
    for (const s of portalScopes) expect(s).not.toMatch(/PAYMENTS|ORDERS|CUSTOMERS/);

    const orgScopes = (new URL(buildSquareAuthorizeUrl('CONSIGNOR', 'con_1', 'user_org').url).searchParams.get('scope') || '').split(' ');
    expect(orgScopes).toEqual([
      'MERCHANT_PROFILE_READ',
      'PAYMENTS_WRITE',
      'PAYMENTS_READ',
      'BANK_ACCOUNTS_READ',
      'ORDERS_WRITE',
      'ORDERS_READ',
      'PAYMENTS_WRITE_SHARED_ONFILE',
      'CUSTOMERS_WRITE',
      'CUSTOMERS_READ',
      'PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS',
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('portal flow', () => {
  async function start(c: any) {
    const { onboardingUrl } = await startPortalSquareConnection(c.portalToken);
    return stateFromUrl(onboardingUrl);
  }

  it('status: 404 for an unknown or missing token; no merchant ids or tokens in the view', async () => {
    seedConsignor({ squareAccountId: 'M1', squareOnboarded: true, squareAccessTokenEncrypted: 'enc:v1:x' });
    await expectPortalError(getPortalSquareStatus('tok_nope'), 404, 'PORTAL_NOT_FOUND');
    await expectPortalError(getPortalSquareStatus(undefined), 404, 'PORTAL_NOT_FOUND');
    const view = await getPortalSquareStatus('tok_1');
    expect(view).toEqual({ status: 'ACTIVE', canConnect: false, payoutsFlaggedForReview: false });
    expect(JSON.stringify(view)).not.toMatch(/M1|enc:v1/);
  });

  it('first connect: stores only the nonce hash at start, consumes it on callback, writes the connection, emails both sides', async () => {
    const c = seedConsignor();
    const state = await start(c);
    const decoded = decodeSquarePortalOAuthState(state)!;
    expect(c.squarePortalOAuthNonce).toBe(hashSquarePortalNonce(decoded.nonce));
    expect(c.squarePortalOAuthNonce).not.toBe(decoded.nonce);

    squareReturns('M_NEW');
    const res = await completePortalSquareConnection({ portalToken: c.portalToken, code: 'code_1', state });
    expect(res).toMatchObject({ status: 'ACTIVE', squareOnboarded: true, needsActivation: false });
    expect(c).toMatchObject({
      squareAccountId: 'M_NEW',
      squareOnboarded: true,
      squareAccessTokenEncrypted: 'enc:v1:at_M_NEW',
      squareRefreshTokenEncrypted: 'enc:v1:rt_M_NEW',
      squarePortalOAuthNonce: null,
    });
    await new Promise((r) => setImmediate(r));
    expect(sendConsignorSquareConnectedNotice).toHaveBeenCalled();
    expect(sendOrganizerConsignorSquareConnectedNotice).toHaveBeenCalled();
  });

  it('replayed: the same state cannot complete twice, and an older start is invalidated by a newer one', async () => {
    const c = seedConsignor();
    const first = await start(c);
    const second = await start(c);
    squareReturns('M_X', 'INACTIVE');
    await expectPortalError(completePortalSquareConnection({ portalToken: c.portalToken, code: 'k', state: first }), 409, 'STATE_USED');
    await completePortalSquareConnection({ portalToken: c.portalToken, code: 'k', state: second });
    await expectPortalError(completePortalSquareConnection({ portalToken: c.portalToken, code: 'k', state: second }), 409, 'STATE_USED');
  });

  it('cross-consignor: a state minted for one portal is refused on another portal, before any code exchange', async () => {
    const a = seedConsignor();
    const b = seedConsignor();
    const stateForA = await start(a);
    await expectPortalError(completePortalSquareConnection({ portalToken: b.portalToken, code: 'k', state: stateForA }), 403, 'STATE_MISMATCH');
    expect(mockObtainToken).not.toHaveBeenCalled();
    expect(b.squareAccountId).toBeNull();
  });

  it('wrong variant: an organizer state is refused by the portal callback', async () => {
    const c = seedConsignor();
    const orgState = encodeSquareOAuthState('CONSIGNOR', c.id, 'user_org');
    await expectPortalError(completePortalSquareConnection({ portalToken: c.portalToken, code: 'k', state: orgState }), 400, 'STATE_INVALID');
  });

  it('forged or expired states are refused', async () => {
    const c = seedConsignor();
    await expectPortalError(completePortalSquareConnection({ portalToken: c.portalToken, code: 'k', state: 'garbage' }), 400, 'STATE_INVALID');
    const expired = signPayload({ via: 'PORTAL', ownerType: 'CONSIGNOR', ownerId: c.id, nonce: 'n', ts: Date.now() - 2 * SQUARE_PORTAL_OAUTH_STATE_MAX_AGE_MS });
    await expectPortalError(completePortalSquareConnection({ portalToken: c.portalToken, code: 'k', state: expired }), 400, 'STATE_INVALID');
    expect(mockObtainToken).not.toHaveBeenCalled();
  });

  it('already onboarded: start and callback refuse with 409 and never overwrite', async () => {
    const c = seedConsignor({ squareAccountId: 'M_OLD', squareOnboarded: true, squareAccessTokenEncrypted: 'enc:v1:old' });
    await expectPortalError(startPortalSquareConnection(c.portalToken), 409, 'SQUARE_ALREADY_CONNECTED');
    // even with a validly signed state + nonce on file (e.g. started before the organizer connected)
    const { state, nonce } = encodeSquarePortalOAuthState(c.id);
    c.squarePortalOAuthNonce = hashSquarePortalNonce(nonce);
    squareReturns('M_ATTACKER');
    await expectPortalError(completePortalSquareConnection({ portalToken: c.portalToken, code: 'k', state }), 409, 'SQUARE_ALREADY_CONNECTED');
    expect(c.squareAccountId).toBe('M_OLD');
    expect(mockObtainToken).not.toHaveBeenCalled();
  });

  it('needs activation: an existing but inactive Square account is stored, reported, and can be refreshed', async () => {
    const c = seedConsignor();
    const state = await start(c);
    squareReturns('M_INACTIVE', 'INACTIVE');
    const res = await completePortalSquareConnection({ portalToken: c.portalToken, code: 'k', state });
    expect(res).toMatchObject({ status: 'NEEDS_ACTIVATION', needsActivation: true, canConnect: true });
    expect(c).toMatchObject({ squareAccountId: 'M_INACTIVE', squareOnboarded: false });

    mockMerchantsList.mockResolvedValue({ data: [{ id: 'M_INACTIVE', status: 'ACTIVE' }] });
    expect(await refreshPortalSquareStatus(c.portalToken)).toMatchObject({ status: 'ACTIVE', canConnect: false });
    expect(c.squareOnboarded).toBe(true);
  });

  it('needs activation: the portal may only reconnect the SAME merchant, never switch to another', async () => {
    const c = seedConsignor({ squareAccountId: 'M_FIRST', squareOnboarded: false });
    const state = await start(c);
    squareReturns('M_OTHER', 'ACTIVE');
    await expectPortalError(completePortalSquareConnection({ portalToken: c.portalToken, code: 'k', state }), 409, 'SQUARE_ACCOUNT_MISMATCH');
    expect(c.squareAccountId).toBe('M_FIRST');
  });

  it('refresh never changes the stored merchant', async () => {
    const c = seedConsignor({ squareAccountId: 'M_A', squareOnboarded: false, squareAccessTokenEncrypted: 'enc:v1:at' });
    mockMerchantsList.mockResolvedValue({ data: [{ id: 'M_B', status: 'ACTIVE' }] });
    expect(await refreshPortalSquareStatus(c.portalToken)).toMatchObject({ status: 'NEEDS_ACTIVATION' });
    expect(c).toMatchObject({ squareAccountId: 'M_A', squareOnboarded: false });
  });

  it('a Square code-exchange failure is a 502 and leaves the row untouched', async () => {
    const c = seedConsignor();
    const state = await start(c);
    mockObtainToken.mockRejectedValue(Object.assign(new Error('bad code'), { statusCode: 400 }));
    await expectPortalError(completePortalSquareConnection({ portalToken: c.portalToken, code: 'k', state }), 502, 'SQUARE_EXCHANGE_FAILED');
    expect(c.squareAccountId).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('shared persistence', () => {
  const tokens = { squareAccessTokenEncrypted: 'enc:v1:a', squareRefreshTokenEncrypted: null, squareTokenExpiresAt: null };
  const status = (merchantId: string) => ({ merchantId, locationId: null, status: 'ACTIVE', active: true, businessName: null, country: null, currency: null });

  it('ORGANIZER mode overwrites unconditionally (unchanged organizer behavior)', async () => {
    const c = seedConsignor({ squareAccountId: 'M_OLD', squareOnboarded: true });
    expect(await persistConsignorSquareConnection(c.id, tokens, status('M_NEW'), 'ORGANIZER')).toBe(true);
    expect(c.squareAccountId).toBe('M_NEW');
  });

  it('PORTAL mode refuses to overwrite a different merchant', async () => {
    const c = seedConsignor({ squareAccountId: 'M_OLD' });
    expect(await persistConsignorSquareConnection(c.id, tokens, status('M_NEW'), 'PORTAL')).toBe(false);
    expect(c.squareAccountId).toBe('M_OLD');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('shared Square merchant across rows is not fraud', () => {
  it('the same merchant on two consignor rows and an organizer row raises no flag', async () => {
    const a = seedConsignor({ squareAccountId: 'M_SHARED' });
    const b = seedConsignor({ squareAccountId: 'M_SHARED' });
    store.organizer.push({ id: 'org_1', squareMerchantId: 'M_SHARED', payoutsFlaggedForReview: false });
    await recordAndCheckSquareBankFingerprints('M_SHARED', [{ fingerprint: 'fp_bank', last4: '1234', bankName: 'B', routingLast4: '5678' }]);
    // second pass, as if a later connect re-ran the check for the same merchant
    await recordAndCheckSquareBankFingerprints('M_SHARED', [{ fingerprint: 'fp_bank', last4: '1234', bankName: 'B', routingLast4: '5678' }]);
    expect(a.payoutsFlaggedForReview).toBe(false);
    expect(b.payoutsFlaggedForReview).toBe(false);
    expect(store.organizer[0].payoutsFlaggedForReview).toBe(false);
  });

  it('the same bank fingerprint under a DIFFERENT merchant is still flagged', async () => {
    const a = seedConsignor({ squareAccountId: 'M_ONE' });
    const b = seedConsignor({ squareAccountId: 'M_TWO' });
    await recordAndCheckSquareBankFingerprints('M_ONE', [{ fingerprint: 'fp_same', last4: null, bankName: null, routingLast4: null }]);
    await recordAndCheckSquareBankFingerprints('M_TWO', [{ fingerprint: 'fp_same', last4: null, bankName: null, routingLast4: null }]);
    expect(b.payoutsFlaggedForReview).toBe(true);
    expect(a.payoutsFlaggedForReview).toBe(true);
  });
});
