/**
 * authSecurity.ts -- small pure helpers for the auth flows (2026-09-29 security pass), kept dependency-free
 * so they can be unit tested without booting the 1,400-line authController.
 */
import crypto from 'crypto';

/**
 * Exact-origin redirect check. The old check was `uri.startsWith(FRONTEND_URL)`, which accepts
 * `https://finda.sale.evil.com` and `https://finda.sale@evil.com/x` when FRONTEND_URL is `https://finda.sale`.
 * A redirect is valid only when it parses as an absolute http(s) URL, has no credentials, and its ORIGIN
 * (scheme + host + port) equals the frontend origin. null/undefined/'' means "no redirect requested".
 */
export function isSameOriginRedirect(uri: unknown, frontendUrl: string): boolean {
  if (uri === null || uri === undefined || uri === '') return true;
  if (typeof uri !== 'string') return false;
  if (/[\\\u0000-\u001f]/.test(uri)) return false; // backslash tricks and control characters
  let target: URL;
  let allowed: URL;
  try {
    target = new URL(uri);
    allowed = new URL(frontendUrl);
  } catch {
    return false;
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') return false;
  if (target.username || target.password) return false;
  return target.origin === allowed.origin;
}

export type DobCheck = 'ok' | 'invalid' | 'minor';

/**
 * Age gate (18+). `new Date('abc')` is an Invalid Date whose getTime() is NaN, and `NaN < 18` is false, so the old
 * inline check let any unparseable date of birth through. Invalid, future and implausible (over 120 years) dates
 * are 'invalid'; under 18 is 'minor'. Age is computed from calendar birthdays, not a 365.25-day average.
 */
export function checkAdultDob(raw: unknown, now: Date = new Date()): DobCheck {
  if (typeof raw !== 'string' && typeof raw !== 'number' && !(raw instanceof Date)) return 'invalid';
  if (typeof raw === 'string' && !raw.trim()) return 'invalid';
  const dob = new Date(raw as any);
  if (Number.isNaN(dob.getTime())) return 'invalid';
  if (dob.getTime() > now.getTime()) return 'invalid';
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < dob.getUTCMonth() ||
    (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  if (age > 120) return 'invalid';
  return age < 18 ? 'minor' : 'ok';
}

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

/** Returns an error message, or null when the password is acceptable. Must be a string of 8-128 characters. */
export function passwordProblem(pw: unknown): string | null {
  if (typeof pw !== 'string') return 'Password is required.';
  if (pw.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (pw.length > MAX_PASSWORD_LENGTH) return `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
  return null;
}

/** Trim + lowercase an email from a request body; undefined unless it is a non-empty string. */
export function normalizeEmailInput(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const e = raw.trim().toLowerCase();
  return e ? e : undefined;
}

/**
 * Password-reset and email-verification tokens are stored HASHED (2026-09-30). The stored form is
 * `sha256:<hex of SHA-256(token)>`; the marker tells a hashed row from a legacy plaintext row written before this
 * change. The raw token only ever exists in the email link. A database read (backup, SQL injection, a leaked
 * replica) therefore no longer yields working reset / verification links.
 */
export const TOKEN_HASH_PREFIX = 'sha256:';

export function hashOpaqueToken(token: string): string {
  return TOKEN_HASH_PREFIX + crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * A presented token can never legitimately start with the marker (real tokens are hex or a UUID). Refusing it up
 * front closes the hole where an attacker who reads a stored hash presents the hash itself and matches the legacy
 * plaintext lookup.
 */
export function looksLikeStoredTokenHash(token: string): boolean {
  return token.startsWith(TOKEN_HASH_PREFIX);
}

/**
 * Lookup order for a presented token: the hashed form first, then (legacy) the plaintext form so a link emailed
 * before this deploy keeps working until it expires (1h reset / 24h verify). Empty when the token is unusable.
 */
export function tokenLookupCandidates(token: unknown): string[] {
  if (typeof token !== 'string' || !token || looksLikeStoredTokenHash(token)) return [];
  return [hashOpaqueToken(token), token];
}

const SENSITIVE_USER_FIELDS = [
  'password',
  'resetToken',
  'resetTokenExpiry',
  'emailVerificationToken',
  'emailVerificationTokenExpiry',
  'deviceFingerprint',
  'fraudSuspect',
] as const;

/**
 * Copy of a user row that is safe to send to the browser. Login, register, OAuth, verify and /auth/me used to send
 * the whole row minus `password`, which leaked the live password-reset token and email-verification token (either of
 * which is a working credential) to anyone who could read the response, plus internal fraud/device columns.
 */
export function stripSensitiveUserFields<T extends Record<string, any>>(user: T): Omit<T, (typeof SENSITIVE_USER_FIELDS)[number]> {
  const out: Record<string, any> = { ...user };
  for (const k of SENSITIVE_USER_FIELDS) delete out[k];
  return out as Omit<T, (typeof SENSITIVE_USER_FIELDS)[number]>;
}
