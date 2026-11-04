/**
 * oauthAssertion.ts -- proof that an /auth/oauth or /auth/oauth/link request really came out of a completed
 * NextAuth provider sign-in.
 *
 * The problem (2026-09-29 auth review): the browser posts { provider, providerId, email, name } to the backend and
 * the backend believed it. Anyone could POST a made-up profile to create an account with emailVerified=true, or
 * sign in as any user whose (provider, providerId) they know or guess.
 *
 * The fix: the NextAuth SERVER (Vercel, where the provider round-trip actually happens) signs
 *   base64url(JSON{p,i,e,x}) + '.' + HMAC-SHA256(OAUTH_BRIDGE_SECRET, thatBase64)
 * over provider, providerId, normalized email and an expiry, and the browser forwards it as `oauthAssertion`.
 * The backend recomputes the HMAC and requires the claims to equal the request fields. The secret never reaches
 * the browser. Enforcement is always ON. 2026-11-04: when OAUTH_BRIDGE_SECRET is NOT set the bridge fails closed
 * (every /auth/oauth and /auth/oauth/link request is refused) instead of accepting unsigned profiles, which
 * would let anyone sign in as any user whose provider id they know. A warning is logged at startup and on the
 * first refused request.
 */
import crypto from 'crypto';

const DEFAULT_TTL_SECONDS = 10 * 60;

export interface OAuthAssertionFields {
  provider: string;
  providerId: string;
  email?: string | null;
}

export const normalizeOAuthEmail = (e: unknown): string | null =>
  typeof e === 'string' && e.trim() ? e.trim().toLowerCase() : null;

const b64u = (s: string | Buffer): string => Buffer.from(s).toString('base64url');

const hmac = (secret: string, body: string): Buffer => crypto.createHmac('sha256', secret).update(body).digest();

/** Used by the frontend NextAuth callback (and tests). Returns `<payload>.<signature>`. */
export function signOAuthAssertion(
  fields: OAuthAssertionFields,
  secret: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
  nowMs: number = Date.now()
): string {
  const payload = {
    p: fields.provider,
    i: fields.providerId,
    e: normalizeOAuthEmail(fields.email),
    x: Math.floor(nowMs / 1000) + ttlSeconds,
  };
  const body = b64u(JSON.stringify(payload));
  return `${body}.${b64u(hmac(secret, body))}`;
}

export type OAuthAssertionResult = { ok: true } | { ok: false; reason: string };

export function verifyOAuthAssertion(
  assertion: unknown,
  fields: OAuthAssertionFields,
  secret: string,
  nowMs: number = Date.now()
): OAuthAssertionResult {
  if (typeof assertion !== 'string' || assertion.length > 2048) return { ok: false, reason: 'missing' };
  const parts = assertion.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'malformed' };
  const [body, sig] = parts;

  const expected = hmac(secret, body);
  let given: Buffer;
  try {
    given = Buffer.from(sig, 'base64url');
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return { ok: false, reason: 'bad_signature' };
  }

  let claims: any;
  try {
    claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!claims || typeof claims !== 'object') return { ok: false, reason: 'malformed' };
  if (typeof claims.x !== 'number' || claims.x * 1000 < nowMs) return { ok: false, reason: 'expired' };
  if (claims.p !== fields.provider || claims.i !== fields.providerId) return { ok: false, reason: 'mismatch' };
  if ((claims.e ?? null) !== normalizeOAuthEmail(fields.email)) return { ok: false, reason: 'mismatch' };
  return { ok: true };
}

let warnedLegacy = false;
/** Test helper. */
export const __resetOAuthAssertionWarning = () => { warnedLegacy = false; };

export const OAUTH_BRIDGE_SECRET_MISSING_WARNING =
  '[auth] OAUTH_BRIDGE_SECRET is not set: Google/Facebook sign-in through /auth/oauth is REFUSED (fail closed) until it is set to the same value on Vercel and Railway.';

/** Startup check (index.ts). Logs a clear warning when the bridge secret is missing; returns whether it is set. */
export function warnIfOAuthBridgeSecretMissing(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.OAUTH_BRIDGE_SECRET) return true;
  console.warn(OAUTH_BRIDGE_SECRET_MISSING_WARNING);
  return false;
}

/**
 * Controller entry point. Returns null when the request may proceed, else a reason string for a 401.
 * With no OAUTH_BRIDGE_SECRET configured every request is refused ('not_configured'); unsigned profiles are
 * never accepted.
 */
export function enforceOAuthAssertion(
  assertion: unknown,
  fields: OAuthAssertionFields,
  env: NodeJS.ProcessEnv = process.env,
  nowMs: number = Date.now()
): string | null {
  const secret = env.OAUTH_BRIDGE_SECRET;
  if (!secret) {
    if (!warnedLegacy) {
      warnedLegacy = true;
      console.warn(OAUTH_BRIDGE_SECRET_MISSING_WARNING);
    }
    return 'not_configured';
  }
  const r = verifyOAuthAssertion(assertion, fields, secret, nowMs);
  return r.ok ? null : r.reason;
}
