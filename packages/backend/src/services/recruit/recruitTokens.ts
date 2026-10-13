/**
 * recruitTokens.ts -- ADR-139 §6 signed link tokens for the recruit channel.
 *
 * sig = base64url(HMAC-SHA256(RECRUIT_UNSUB_SECRET, leadId + ':' + purpose))
 *
 * Purposes are distinct ('unsub' / 'confirm') so one link type can never be replayed as
 * the other. No expiry: unsubscribe links must keep working forever. Verification is
 * constant-time and never throws on a length mismatch.
 */
import crypto from 'crypto';

export type RecruitTokenPurpose = 'unsub' | 'confirm';

const MIN_SECRET_LENGTH = 32;

function secretOrNull(secret?: string): string | null {
  const s = secret ?? process.env.RECRUIT_UNSUB_SECRET ?? '';
  return s.length >= MIN_SECRET_LENGTH ? s : null;
}

export function hasUsableSecret(secret?: string): boolean {
  return secretOrNull(secret) !== null;
}

/** Returns the signature, or throws if the secret is missing or shorter than 32 characters. */
export function signRecruitToken(leadId: string, purpose: RecruitTokenPurpose, secret?: string): string {
  const s = secretOrNull(secret);
  if (!s) throw new Error('RECRUIT_UNSUB_SECRET is not set or is shorter than 32 characters');
  return crypto.createHmac('sha256', s).update(`${leadId}:${purpose}`).digest('base64url');
}

/** Constant-time verify. Returns false (never throws) on any malformed input or missing secret. */
export function verifyRecruitToken(
  leadId: string,
  sig: string,
  purpose: RecruitTokenPurpose,
  secret?: string
): boolean {
  if (typeof leadId !== 'string' || typeof sig !== 'string') return false;
  if (leadId.length === 0 || leadId.length > 64 || sig.length === 0 || sig.length > 128) return false;
  const s = secretOrNull(secret);
  if (!s) return false;
  const expected = Buffer.from(crypto.createHmac('sha256', s).update(`${leadId}:${purpose}`).digest('base64url'));
  const given = Buffer.from(sig);
  if (given.length !== expected.length) {
    // Still burn a compare so timing does not reveal the length check.
    crypto.timingSafeEqual(expected, expected);
    return false;
  }
  return crypto.timingSafeEqual(expected, given);
}

/** sha256(ip + secret) -- the raw IP is never stored. */
export function hashConsentIp(ip: string | undefined, secret?: string): string | null {
  const s = secretOrNull(secret);
  if (!ip || !s) return null;
  return crypto.createHash('sha256').update(`${ip}${s}`).digest('hex');
}
