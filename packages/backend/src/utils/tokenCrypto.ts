/**
 * tokenCrypto.ts — AES-256-GCM encryption-at-rest for social OAuth tokens.
 *
 * ADR-077a (DECIDED): SocialAccount.accessToken / refreshToken are stored ENCRYPTED,
 * NOT plaintext (unlike the EbayConnection precedent) — the blast radius of a leaked
 * brand social token is order-of-magnitude larger than a single organizer's eBay token.
 *
 * Envelope format (self-describing, stored in the existing String columns):
 *   enc:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>
 *
 * - iv       : 12 random bytes per encryption (GCM standard), never reused.
 * - authTag  : 16-byte GCM auth tag (detects tamper/corruption on decrypt).
 * - ciphertext: AES-256-GCM output, hex.
 *
 * Key: process.env.SOCIAL_TOKEN_ENC_KEY — 32-byte key, hex-encoded (64 hex chars).
 * FAIL LOUD at module load if missing or wrong length — NEVER silently fall back to
 * plaintext or a default key (ADR-077a invariant #8).
 *
 * The ONLY caller of these functions is services/social/tokenStore.ts.
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // bytes — GCM recommended
const KEY_LENGTH = 32; // bytes — AES-256
const ENVELOPE_PREFIX = 'enc:v1:';

/**
 * Load and validate the encryption key at module load.
 * Throws (crashes the deploy) if the key is missing or not exactly 32 bytes.
 */
function loadKey(): Buffer {
  const hex = process.env.SOCIAL_TOKEN_ENC_KEY;
  if (!hex) {
    throw new Error(
      '[tokenCrypto] SOCIAL_TOKEN_ENC_KEY is not set. Social token encryption cannot ' +
        'operate without it. Set a 32-byte hex key (64 hex chars) on the Railway backend ' +
        'service. Refusing to start (fail-loud, never plaintext fallback).'
    );
  }
  let key: Buffer;
  try {
    key = Buffer.from(hex, 'hex');
  } catch {
    throw new Error('[tokenCrypto] SOCIAL_TOKEN_ENC_KEY is not valid hex.');
  }
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `[tokenCrypto] SOCIAL_TOKEN_ENC_KEY must decode to exactly ${KEY_LENGTH} bytes ` +
        `(${KEY_LENGTH * 2} hex chars); got ${key.length} bytes. Refusing to start.`
    );
  }
  return key;
}

// Evaluated at module load — a bad/missing key crashes startup (invariant #8).
const KEY: Buffer = loadKey();

/**
 * Encrypt a plaintext token into the `enc:v1:<iv>:<tag>:<ciphertext>` envelope.
 * A fresh random IV is generated for every call.
 */
export function encryptToken(plaintext: string): string {
  if (typeof plaintext !== 'string') {
    throw new Error('[tokenCrypto] encryptToken requires a string');
  }
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${ENVELOPE_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/**
 * Decrypt an `enc:v1:...` envelope back to plaintext, verifying the auth tag.
 * Throws on tamper or malformed envelope.
 *
 * Legacy-plaintext guard: if the input does NOT start with `enc:v1:`, it is returned
 * unchanged (with a warning). We encrypt from Phase 1 so this should never fire, but
 * it keeps the helper safe if a raw value is ever written by mistake.
 */
export function decryptToken(stored: string): string {
  if (typeof stored !== 'string' || stored.length === 0) {
    throw new Error('[tokenCrypto] decryptToken requires a non-empty string');
  }
  if (!stored.startsWith(ENVELOPE_PREFIX)) {
    console.warn(
      '[tokenCrypto] decryptToken received a value without the enc:v1: prefix — ' +
        'treating as legacy plaintext. This should not happen; tokens are encrypted from Phase 1.'
    );
    return stored;
  }

  const remainder = stored.slice(ENVELOPE_PREFIX.length);
  const parts = remainder.split(':');
  if (parts.length !== 3) {
    throw new Error('[tokenCrypto] malformed token envelope (expected iv:tag:ciphertext)');
  }
  const [ivHex, tagHex, ciphertextHex] = parts;

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(tagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  if (iv.length !== IV_LENGTH) {
    throw new Error('[tokenCrypto] invalid IV length in token envelope');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

/**
 * True if the stored value is an encrypted envelope (vs legacy plaintext).
 */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(ENVELOPE_PREFIX);
}
