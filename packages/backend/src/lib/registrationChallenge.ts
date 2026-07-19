import crypto from 'crypto';

/**
 * registrationChallenge.ts — first-party, stateless proof-of-work anti-abuse gate for
 * POST /auth/register, replacing the removed Cloudflare Turnstile CAPTCHA (2026-07-19,
 * see claude_docs/feature-notes/adr-registration-pow-2026-07-19.md).
 *
 * No DB or Redis write is needed to issue a challenge — validity is entirely carried in
 * the signed token itself (nonceSeed + issuedAt + difficulty), verified via HMAC-SHA256
 * keyed on JWT_SECRET. This mirrors the existing OAuth-state-signing pattern already used
 * in ebayController.ts (base64url payload + '.' + base64url HMAC signature, constant-time
 * comparison via crypto.timingSafeEqual).
 */

const DIFFICULTY = 4; // leading hex-zero characters required — tune via this constant only
const MIN_AGE_MS = 300; // reject if solved suspiciously faster than this (weak signal, redundant with difficulty cost)
const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes — same expiry window used for eBay OAuth state

interface ChallengePayload {
  nonceSeed: string;
  issuedAt: number;
  difficulty: number;
}

export function issueChallenge(): { token: string; difficulty: number } {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    // Fail closed at the source — no token issued without a secret to sign it.
    throw new Error('JWT_SECRET missing — cannot issue registration challenge');
  }

  const payload: ChallengePayload = {
    nonceSeed: crypto.randomBytes(16).toString('hex'),
    issuedAt: Date.now(),
    difficulty: DIFFICULTY,
  };
  const payloadStr = JSON.stringify(payload);
  const encodedPayload = Buffer.from(payloadStr).toString('base64url');
  const signature = crypto.createHmac('sha256', jwtSecret).update(payloadStr).digest('base64url');

  return {
    token: `${encodedPayload}.${signature}`,
    difficulty: DIFFICULTY,
  };
}

export function verifyChallenge(
  token: string | undefined | null,
  nonce: string | undefined | null
): { valid: boolean; reason?: string } {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    return { valid: false, reason: 'server_misconfigured' };
  }
  if (!token || !nonce) {
    return { valid: false, reason: 'missing_token_or_nonce' };
  }

  const dotIdx = token.lastIndexOf('.');
  if (dotIdx <= 0 || dotIdx === token.length - 1) {
    return { valid: false, reason: 'malformed_token' };
  }
  const encodedPayload = token.slice(0, dotIdx);
  const providedSig = token.slice(dotIdx + 1);

  let payloadStr: string;
  let payload: ChallengePayload;
  try {
    payloadStr = Buffer.from(encodedPayload, 'base64url').toString('utf-8');
    payload = JSON.parse(payloadStr);
  } catch {
    return { valid: false, reason: 'malformed_token' };
  }

  // Constant-time signature comparison — same pattern as ebayController.ts OAuth state verification.
  const expectedSig = crypto.createHmac('sha256', jwtSecret).update(payloadStr).digest('base64url');
  const providedSigBuf = Buffer.from(providedSig);
  const expectedSigBuf = Buffer.from(expectedSig);
  if (
    providedSigBuf.length !== expectedSigBuf.length ||
    !crypto.timingSafeEqual(providedSigBuf, expectedSigBuf)
  ) {
    return { valid: false, reason: 'bad_signature' };
  }

  const age = Date.now() - payload.issuedAt;
  if (age < MIN_AGE_MS || age > MAX_AGE_MS) {
    return { valid: false, reason: 'expired_or_too_fast' };
  }

  const digest = crypto.createHash('sha256').update(`${payload.nonceSeed}:${nonce}`).digest('hex');
  const requiredZeros = '0'.repeat(payload.difficulty);
  if (!digest.startsWith(requiredZeros)) {
    return { valid: false, reason: 'difficulty_not_met' };
  }

  return { valid: true };
}
