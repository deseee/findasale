/**
 * etsyOAuthState.ts -- PKCE helpers and the DB-backed single-use OAuth state (ADR-135 D1.3, D1.6,
 * section 7 item 1). Batch B1.
 *
 * Why a table: the only earlier PKCE precedent (socialPublisherController.ts) keeps the verifier in
 * an in-memory Map, which is neither multi-organizer nor multi-replica safe, and eBay's callback
 * uses stateless HMAC state that is not single-use. Etsy therefore gets EtsyOAuthState rows:
 *   - state      = base64url of 32 random bytes; sent to the browser in the authorize URL only.
 *   - stateHash  = sha256(state) hex; the ONLY form stored (unique).
 *   - verifier   = 64 random bytes base64url (86 chars, inside RFC 7636's 43-128 range), stored
 *                  encrypted (enc:v1:, utils/tokenCrypto.ts) as codeVerifierEnc.
 *   - challenge  = base64url(sha256(verifier)), method S256 (Etsy requires S256).
 * consumeEtsyOAuthState claims the row with ONE atomic updateMany bound to stateHash, organizerId,
 * userId, consumedAt IS NULL and expiresAt > now. Zero rows means the same generic failure (null)
 * whichever check failed, so the response never hints which one.
 *
 * Sources: authorize host, parameters and S256 rule from
 * https://developers.etsy.com/documentation/essentials/authentication (fetched 2026-10-03);
 * RFC 7636 section 4 and Appendix B (test vector used in the unit test).
 *
 * Import safety: tokenCrypto throws at module load when SOCIAL_TOKEN_ENC_KEY is missing, so it is
 * loaded lazily and only through loadEtsyTokenCrypto (which maps the failure to ETSY_NOT_CONFIGURED,
 * so connect fails closed instead of storing plaintext).
 */

import crypto from 'crypto';
import { EtsyError } from './etsyBudget';

/** The five scopes ADR-135 D1.4 requests, and no others. */
export const ETSY_SCOPES = ['listings_r', 'listings_w', 'listings_d', 'transactions_r', 'shops_r'] as const;
export const ETSY_SCOPE_STRING = ETSY_SCOPES.join(' ');
export const ETSY_AUTHORIZE_URL = 'https://www.etsy.com/oauth/connect';
export const ETSY_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
export const ETSY_OAUTH_STATE_PRUNE_AFTER_MS = 24 * 60 * 60 * 1000;

export interface EtsyTokenCrypto {
  encrypt(plaintext: string): string;
  decrypt(stored: string): string;
}

/** Loads utils/tokenCrypto lazily. Throws ETSY_NOT_CONFIGURED when the encryption key is missing or invalid. */
export function loadEtsyTokenCrypto(): EtsyTokenCrypto {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../../utils/tokenCrypto');
    return { encrypt: mod.encryptToken, decrypt: mod.decryptToken };
  } catch {
    throw new EtsyError('ETSY_NOT_CONFIGURED', 'Token encryption is not configured');
  }
}

export function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export type RandomBytesFn = (size: number) => Buffer;

/** 64 random bytes as base64url: 86 characters. */
export function generateCodeVerifier(randomBytes: RandomBytesFn = crypto.randomBytes): string {
  return base64UrlEncode(randomBytes(64));
}

/** base64url(sha256(verifier)). RFC 7636 Appendix B: dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk gives E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM. */
export function deriveCodeChallenge(verifier: string): string {
  return base64UrlEncode(crypto.createHash('sha256').update(verifier, 'ascii').digest());
}

/** 32 random bytes as base64url: 43 characters. */
export function generateOAuthState(randomBytes: RandomBytesFn = crypto.randomBytes): string {
  return base64UrlEncode(randomBytes(32));
}

/** sha256 hex of the raw state; the only form that is stored. */
export function hashOAuthState(state: string): string {
  return crypto.createHash('sha256').update(state, 'utf8').digest('hex');
}

export interface BuildAuthorizeUrlArgs {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  codeChallenge: string;
}

/** Authorize URL with response_type=code, S256, the scopes, the server-built redirect_uri and the state. Spaces are encoded as %20. */
export function buildEtsyAuthorizeUrl(a: BuildAuthorizeUrlArgs): string {
  const q: Array<[string, string]> = [
    ['response_type', 'code'],
    ['client_id', a.clientId],
    ['redirect_uri', a.redirectUri],
    ['scope', a.scope],
    ['state', a.state],
    ['code_challenge', a.codeChallenge],
    ['code_challenge_method', 'S256'],
  ];
  return `${ETSY_AUTHORIZE_URL}?${q.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')}`;
}

export interface EtsyOAuthStateDeps {
  /** Prisma-shaped client. Defaults to the shared client, loaded lazily. */
  db?: any;
  crypto?: EtsyTokenCrypto;
  now?: () => Date;
  randomBytes?: RandomBytesFn;
}

function defaultDb(): any {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../lib/prisma').prisma;
}

export interface CreatedEtsyOAuthState {
  /** Raw state for the authorize URL. Never stored, never logged. */
  state: string;
  codeChallenge: string;
  requestedScopes: string;
  expiresAt: Date;
}

/** Create and persist a state row bound to the organizer and user. Only sha256(state) and the encrypted verifier are stored. */
export async function createEtsyOAuthState(
  args: { organizerId: string; userId: string },
  deps: EtsyOAuthStateDeps = {}
): Promise<CreatedEtsyOAuthState> {
  const db = deps.db ?? defaultDb();
  const crypt = deps.crypto ?? loadEtsyTokenCrypto();
  const now = (deps.now ?? (() => new Date()))();
  const rb = deps.randomBytes ?? crypto.randomBytes;

  const state = generateOAuthState(rb);
  const verifier = generateCodeVerifier(rb);
  const codeChallenge = deriveCodeChallenge(verifier);
  const expiresAt = new Date(now.getTime() + ETSY_OAUTH_STATE_TTL_MS);

  await db.etsyOAuthState.create({
    data: {
      stateHash: hashOAuthState(state),
      organizerId: args.organizerId,
      userId: args.userId,
      codeVerifierEnc: crypt.encrypt(verifier),
      requestedScopes: ETSY_SCOPE_STRING,
      expiresAt,
    },
  });
  return { state, codeChallenge, requestedScopes: ETSY_SCOPE_STRING, expiresAt };
}

export interface ConsumedEtsyOAuthState {
  codeVerifier: string;
  requestedScopes: string;
}

/**
 * Atomically consume a state. Returns null (one generic failure) when the state is unknown, already
 * used, expired, or bound to a different organizer or user.
 */
export async function consumeEtsyOAuthState(
  args: { state: unknown; organizerId: string; userId: string },
  deps: EtsyOAuthStateDeps = {}
): Promise<ConsumedEtsyOAuthState | null> {
  if (typeof args.state !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(args.state)) return null;
  const db = deps.db ?? defaultDb();
  const now = (deps.now ?? (() => new Date()))();
  const stateHash = hashOAuthState(args.state);

  const claimed = await db.etsyOAuthState.updateMany({
    where: {
      stateHash,
      consumedAt: null,
      expiresAt: { gt: now },
      organizerId: args.organizerId,
      userId: args.userId,
    },
    data: { consumedAt: now },
  });
  if (!claimed || claimed.count !== 1) return null;

  const row = await db.etsyOAuthState.findUnique({ where: { stateHash } });
  if (!row) return null;
  try {
    const crypt = deps.crypto ?? loadEtsyTokenCrypto();
    return { codeVerifier: crypt.decrypt(row.codeVerifierEnc), requestedScopes: row.requestedScopes };
  } catch {
    return null;
  }
}

/** Housekeeping: delete states that expired more than a day ago. Returns the number deleted. */
export async function pruneExpiredEtsyOAuthStates(deps: EtsyOAuthStateDeps = {}): Promise<number> {
  const db = deps.db ?? defaultDb();
  const now = (deps.now ?? (() => new Date()))();
  const res = await db.etsyOAuthState.deleteMany({
    where: { expiresAt: { lt: new Date(now.getTime() - ETSY_OAUTH_STATE_PRUNE_AFTER_MS) } },
  });
  return res?.count ?? 0;
}
