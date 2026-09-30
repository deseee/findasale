/**
 * lib/oauthAssertion.ts -- SERVER-ONLY signer for the OAuth assertion the backend verifies on
 * POST /auth/oauth and POST /auth/oauth/link.
 *
 * DEPLOY ORDER (matters, do not swap):
 *   1. Set OAUTH_BRIDGE_SECRET on VERCEL first. The NextAuth server starts signing every provider profile
 *      while the backend (secret still unset) keeps accepting unsigned profiles, so nothing breaks.
 *   2. Then set the SAME value as OAUTH_BRIDGE_SECRET on RAILWAY. The backend now enforces the signature
 *      and rejects unsigned or forged profiles.
 *   Setting Railway first would lock every Google/Facebook login out until Vercel catches up.
 *   With the secret unset on Vercel, nothing is signed and login behaves exactly as it did before.
 *
 * Rules: the secret is read from process.env.OAUTH_BRIDGE_SECRET only (never a NEXT_PUBLIC_ variable, never
 * sent to the browser). Only the resulting assertion string travels to the browser, and it is bound to
 * provider, providerId and email and expires after 10 minutes. Import this file from server code only
 * (pages/api/**, getServerSideProps); never from a component.
 *
 * The algorithm MUST stay byte-identical to packages/backend/src/utils/oauthAssertion.ts (signOAuthAssertion):
 *   base64url(JSON{p,i,e,x}) + '.' + base64url(HMAC-SHA256(secret, thatBase64))
 * lib/__tests__/oauthAssertion.test.ts pins a known vector and compares against a copy of the backend algorithm.
 */
import crypto from 'crypto';

export const OAUTH_ASSERTION_TTL_SECONDS = 10 * 60;

export interface OAuthAssertionFields {
  provider: string;
  providerId: string;
  email?: string | null;
}

export const normalizeOAuthEmail = (e: unknown): string | null =>
  typeof e === 'string' && e.trim() ? e.trim().toLowerCase() : null;

const b64u = (s: string | Buffer): string => Buffer.from(s).toString('base64url');

export function signOAuthAssertion(
  fields: OAuthAssertionFields,
  secret: string,
  ttlSeconds: number = OAUTH_ASSERTION_TTL_SECONDS,
  nowMs: number = Date.now()
): string {
  const payload = {
    p: fields.provider,
    i: fields.providerId,
    e: normalizeOAuthEmail(fields.email),
    x: Math.floor(nowMs / 1000) + ttlSeconds,
  };
  const body = b64u(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(body).digest();
  return `${body}.${b64u(sig)}`;
}

/**
 * Returns a signed assertion when OAUTH_BRIDGE_SECRET is configured on this (server) process, else undefined
 * so the caller omits the field and the legacy unsigned flow continues unchanged.
 */
export function maybeSignOAuthAssertion(
  fields: OAuthAssertionFields,
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  const secret = env.OAUTH_BRIDGE_SECRET;
  if (!secret) return undefined;
  if (typeof fields.provider !== 'string' || typeof fields.providerId !== 'string' || !fields.provider || !fields.providerId) {
    return undefined;
  }
  return signOAuthAssertion(fields, secret);
}
