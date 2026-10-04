/**
 * etsyOAuthState.ts -- ADR-135 batch B1 acceptance items 1 (PKCE vector) and 2 (single-use state).
 * Uses the real tokenCrypto (key set below) so the enc:v1: envelope assertion is genuine.
 */

process.env.SOCIAL_TOKEN_ENC_KEY = '11'.repeat(32);

import crypto from 'crypto';
import {
  ETSY_OAUTH_STATE_PRUNE_AFTER_MS,
  ETSY_OAUTH_STATE_TTL_MS,
  ETSY_SCOPES,
  ETSY_SCOPE_STRING,
  buildEtsyAuthorizeUrl,
  consumeEtsyOAuthState,
  createEtsyOAuthState,
  deriveCodeChallenge,
  generateCodeVerifier,
  generateOAuthState,
  hashOAuthState,
  loadEtsyTokenCrypto,
  pruneExpiredEtsyOAuthStates,
} from '../etsyOAuthState';
import { makeEtsyFakeDb } from './etsyFakeDb';

const T0 = new Date('2026-10-03T12:00:00.000Z');

describe('PKCE helpers (acceptance 1)', () => {
  it('matches the RFC 7636 Appendix B test vector', () => {
    expect(deriveCodeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
    );
  });

  it('generates an 86 character base64url verifier (inside the 43-128 PKCE range) and a 43 character state', () => {
    const v = generateCodeVerifier();
    expect(v).toMatch(/^[A-Za-z0-9_-]{86}$/);
    const s = generateOAuthState();
    expect(s).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateCodeVerifier()).not.toBe(v);
  });

  it('requests exactly the five ADR scopes', () => {
    expect([...ETSY_SCOPES]).toEqual(['listings_r', 'listings_w', 'listings_d', 'transactions_r', 'shops_r']);
    expect(ETSY_SCOPE_STRING).toBe('listings_r listings_w listings_d transactions_r shops_r');
  });

  it('builds an authorize URL with response_type=code, S256, scopes, redirect_uri and state', () => {
    const url = new URL(
      buildEtsyAuthorizeUrl({
        clientId: 'KEYSTRING',
        redirectUri: 'https://finda.sale/organizer/etsy-oauth-callback',
        scope: ETSY_SCOPE_STRING,
        state: 'STATE_VALUE_1234567890',
        codeChallenge: 'CHALLENGE',
      })
    );
    expect(`${url.origin}${url.pathname}`).toBe('https://www.etsy.com/oauth/connect');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe('CHALLENGE');
    expect(url.searchParams.get('client_id')).toBe('KEYSTRING');
    expect(url.searchParams.get('redirect_uri')).toBe('https://finda.sale/organizer/etsy-oauth-callback');
    expect(url.searchParams.get('state')).toBe('STATE_VALUE_1234567890');
    expect(url.searchParams.get('scope')!.split(' ')).toEqual([...ETSY_SCOPES]);
  });
});

describe('single-use OAuth state (acceptance 2)', () => {
  async function setup() {
    const db = makeEtsyFakeDb();
    const created = await createEtsyOAuthState({ organizerId: 'org_1', userId: 'user_1' }, { db, now: () => T0 });
    return { db, created };
  }

  it('stores only sha256(state) and an enc:v1: verifier bound to organizer and user', async () => {
    const { db, created } = await setup();
    expect(db.store.states).toHaveLength(1);
    const row = db.store.states[0];
    expect(row.stateHash).toBe(crypto.createHash('sha256').update(created.state).digest('hex'));
    expect(row.stateHash).toBe(hashOAuthState(created.state));
    // The raw state appears in no stored column.
    expect(JSON.stringify(row)).not.toContain(created.state);
    expect(row.codeVerifierEnc.startsWith('enc:v1:')).toBe(true);
    expect(row.organizerId).toBe('org_1');
    expect(row.userId).toBe('user_1');
    expect(row.requestedScopes).toBe(ETSY_SCOPE_STRING);
    expect(row.expiresAt.getTime()).toBe(T0.getTime() + ETSY_OAUTH_STATE_TTL_MS);
    expect(row.consumedAt).toBeNull();
    // The stored verifier is the one whose S256 challenge was handed out.
    const verifier = loadEtsyTokenCrypto().decrypt(row.codeVerifierEnc);
    expect(deriveCodeChallenge(verifier)).toBe(created.codeChallenge);
  });

  it('consumes once; the second consume returns the same generic failure', async () => {
    const { db, created } = await setup();
    const args = { state: created.state, organizerId: 'org_1', userId: 'user_1' };
    const first = await consumeEtsyOAuthState(args, { db, now: () => T0 });
    expect(first).not.toBeNull();
    expect(deriveCodeChallenge(first!.codeVerifier)).toBe(created.codeChallenge);
    expect(first!.requestedScopes).toBe(ETSY_SCOPE_STRING);
    expect(await consumeEtsyOAuthState(args, { db, now: () => T0 })).toBeNull();
  });

  it('fails identically for a wrong organizer, a wrong user and an expired state', async () => {
    const { db, created } = await setup();
    const wrongOrg = await consumeEtsyOAuthState({ state: created.state, organizerId: 'org_2', userId: 'user_1' }, { db, now: () => T0 });
    const wrongUser = await consumeEtsyOAuthState({ state: created.state, organizerId: 'org_1', userId: 'user_2' }, { db, now: () => T0 });
    const expired = await consumeEtsyOAuthState(
      { state: created.state, organizerId: 'org_1', userId: 'user_1' },
      { db, now: () => new Date(T0.getTime() + ETSY_OAUTH_STATE_TTL_MS + 1) }
    );
    const unknown = await consumeEtsyOAuthState({ state: 'A'.repeat(43), organizerId: 'org_1', userId: 'user_1' }, { db, now: () => T0 });
    for (const r of [wrongOrg, wrongUser, expired, unknown]) expect(r).toBeNull();
  });

  it('does not burn the state when a different organizer or user tries it first', async () => {
    const { db, created } = await setup();
    await consumeEtsyOAuthState({ state: created.state, organizerId: 'org_2', userId: 'user_1' }, { db, now: () => T0 });
    await consumeEtsyOAuthState({ state: created.state, organizerId: 'org_1', userId: 'user_9' }, { db, now: () => T0 });
    expect(db.store.states[0].consumedAt).toBeNull();
    expect(await consumeEtsyOAuthState({ state: created.state, organizerId: 'org_1', userId: 'user_1' }, { db, now: () => T0 })).not.toBeNull();
  });

  it('rejects malformed state values without touching the database', async () => {
    const db = makeEtsyFakeDb();
    const spy = jest.spyOn(db.etsyOAuthState, 'updateMany');
    for (const bad of [undefined, null, 42, '', 'short', 'has spaces and !!! characters', 'x'.repeat(500)]) {
      expect(await consumeEtsyOAuthState({ state: bad, organizerId: 'org_1', userId: 'user_1' }, { db })).toBeNull();
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns null (not an exception) when the stored verifier cannot be decrypted', async () => {
    const { db, created } = await setup();
    db.store.states[0].codeVerifierEnc = 'enc:v1:00:00:00';
    expect(await consumeEtsyOAuthState({ state: created.state, organizerId: 'org_1', userId: 'user_1' }, { db, now: () => T0 })).toBeNull();
  });

  it('prunes states that expired more than a day ago and keeps newer ones', async () => {
    const { db } = await setup();
    const later = new Date(T0.getTime() + ETSY_OAUTH_STATE_TTL_MS + ETSY_OAUTH_STATE_PRUNE_AFTER_MS - 1000);
    expect(await pruneExpiredEtsyOAuthStates({ db, now: () => later })).toBe(0);
    const muchLater = new Date(T0.getTime() + ETSY_OAUTH_STATE_TTL_MS + ETSY_OAUTH_STATE_PRUNE_AFTER_MS + 1000);
    expect(await pruneExpiredEtsyOAuthStates({ db, now: () => muchLater })).toBe(1);
    expect(db.store.states).toHaveLength(0);
  });
});

describe('loadEtsyTokenCrypto fails closed', () => {
  it('throws ETSY_NOT_CONFIGURED when SOCIAL_TOKEN_ENC_KEY is missing', () => {
    const saved = process.env.SOCIAL_TOKEN_ENC_KEY;
    delete process.env.SOCIAL_TOKEN_ENC_KEY;
    try {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require('../etsyOAuthState');
        let code: string | undefined;
        try {
          mod.loadEtsyTokenCrypto();
        } catch (e: any) {
          code = e?.code;
        }
        expect(code).toBe('ETSY_NOT_CONFIGURED');
      });
    } finally {
      process.env.SOCIAL_TOKEN_ENC_KEY = saved;
    }
  });
});
