/**
 * tokenStore.ts — the ONLY module that reads/writes SocialAccount.accessToken /
 * refreshToken. All encryption (write) and decryption (read) happens here, so the
 * platform leaf modules (x.ts, youtube.ts, ...) only ever see plaintext tokens and
 * never touch the encrypted columns directly (ADR-077 §3, ADR-077a §2).
 *
 * Mirrors the ebayHttp.ts get/refresh chokepoint pattern: getValidToken() checks
 * tokenExpiresAt with a 5-minute skew (exactly like ebayHttp `expiresIn - 300`) and
 * calls the platform's refresh function if the token is stale.
 */

import { prisma } from '../../lib/prisma';
import { encryptToken, decryptToken } from '../../utils/tokenCrypto';
import type { SocialAccount, SocialPlatform } from '@prisma/client';

// 5-minute refresh skew — identical to ebayHttp.ts (expiresIn - 300).
const REFRESH_SKEW_MS = 5 * 60 * 1000;

/** Fields a platform refresh returns for tokenStore to persist. */
export interface RefreshedTokens {
  accessToken: string; // plaintext — tokenStore encrypts before write
  refreshToken?: string | null; // plaintext — tokenStore encrypts before write
  expiresInSeconds?: number | null; // seconds until accessToken expires
}

/** A platform module supplies its own refresh implementation. */
export type PlatformRefreshFn = (
  account: SocialAccount,
  plaintextRefreshToken: string | null
) => Promise<RefreshedTokens>;

/**
 * Load the SocialAccount for a platform (null if not connected).
 */
export async function getAccount(platform: SocialPlatform): Promise<SocialAccount | null> {
  return prisma.socialAccount.findUnique({ where: { platform } });
}

/**
 * Decrypt the stored access token for an already-loaded account row.
 */
export function readAccessToken(account: SocialAccount): string {
  return decryptToken(account.accessToken);
}

/**
 * Decrypt the stored refresh token (null if the account has none).
 */
export function readRefreshToken(account: SocialAccount): string | null {
  return account.refreshToken ? decryptToken(account.refreshToken) : null;
}

/**
 * Create or update a SocialAccount, ENCRYPTING both token fields before write.
 * This is the write chokepoint used by the OAuth connect/callback flow.
 */
export async function upsertAccount(input: {
  platform: SocialPlatform;
  accessToken: string; // plaintext in
  refreshToken?: string | null; // plaintext in
  tokenExpiresAt?: Date | null;
  platformUserId?: string | null;
  platformUsername?: string | null;
  pageId?: string | null;
}): Promise<SocialAccount> {
  const encAccess = encryptToken(input.accessToken);
  const encRefresh =
    input.refreshToken != null && input.refreshToken !== ''
      ? encryptToken(input.refreshToken)
      : null;

  const now = new Date();
  return prisma.socialAccount.upsert({
    where: { platform: input.platform },
    create: {
      platform: input.platform,
      accessToken: encAccess,
      refreshToken: encRefresh,
      tokenExpiresAt: input.tokenExpiresAt ?? null,
      platformUserId: input.platformUserId ?? null,
      platformUsername: input.platformUsername ?? null,
      pageId: input.pageId ?? null,
      connectedAt: now,
      lastRefreshedAt: now,
      isActive: true,
      lastErrorAt: null,
      lastErrorMessage: null,
    },
    update: {
      accessToken: encAccess,
      refreshToken: encRefresh,
      tokenExpiresAt: input.tokenExpiresAt ?? null,
      platformUserId: input.platformUserId ?? undefined,
      platformUsername: input.platformUsername ?? undefined,
      pageId: input.pageId ?? undefined,
      lastRefreshedAt: now,
      isActive: true,
      lastErrorAt: null,
      lastErrorMessage: null,
    },
  });
}

/**
 * Persist a refreshed token set (ENCRYPTS before write). Called by getValidToken
 * after a platform refresh succeeds.
 */
async function persistRefresh(
  accountId: string,
  refreshed: RefreshedTokens
): Promise<SocialAccount> {
  const encAccess = encryptToken(refreshed.accessToken);
  const encRefresh =
    refreshed.refreshToken != null && refreshed.refreshToken !== ''
      ? encryptToken(refreshed.refreshToken)
      : undefined; // undefined = leave existing refresh token untouched

  const tokenExpiresAt =
    refreshed.expiresInSeconds != null
      ? new Date(Date.now() + refreshed.expiresInSeconds * 1000)
      : null;

  return prisma.socialAccount.update({
    where: { id: accountId },
    data: {
      accessToken: encAccess,
      ...(encRefresh !== undefined ? { refreshToken: encRefresh } : {}),
      tokenExpiresAt,
      lastRefreshedAt: new Date(),
      isActive: true,
      lastErrorAt: null,
      lastErrorMessage: null,
    },
  });
}

/**
 * Record a token/refresh failure on the account (mirrors EbayConnection.lastError*).
 * NEVER writes a raw token into lastErrorMessage (ADR-077a invariant #2) — the caller
 * must pass a scrubbed message.
 */
export async function recordAccountError(
  accountId: string,
  scrubbedMessage: string,
  deactivate = false
): Promise<void> {
  await prisma.socialAccount.update({
    where: { id: accountId },
    data: {
      lastErrorAt: new Date(),
      lastErrorMessage: scrubbedMessage.slice(0, 500),
      ...(deactivate ? { isActive: false } : {}),
    },
  });
}

/**
 * Return a VALID plaintext access token for a platform, refreshing if stale.
 *
 * - Loads the account (throws if not connected / inactive).
 * - If tokenExpiresAt is > 5 min away, returns the decrypted current token.
 * - Otherwise calls the supplied platform refresh fn, persists the encrypted result,
 *   and returns the new plaintext token.
 *
 * On refresh failure, records the error (scrubbed), marks the account inactive, and
 * rethrows so cronGuard surfaces it to Sentry.
 */
export async function getValidToken(
  platform: SocialPlatform,
  refreshFn: PlatformRefreshFn
): Promise<{ account: SocialAccount; accessToken: string }> {
  const account = await getAccount(platform);
  if (!account) {
    throw new Error(`[tokenStore] No connected SocialAccount for platform ${platform}`);
  }
  if (!account.isActive) {
    throw new Error(`[tokenStore] SocialAccount for ${platform} is inactive (needs reconnect)`);
  }

  const stillValid =
    account.tokenExpiresAt != null &&
    account.tokenExpiresAt.getTime() - Date.now() > REFRESH_SKEW_MS;

  if (stillValid) {
    return { account, accessToken: decryptToken(account.accessToken) };
  }

  // Stale or unknown expiry — attempt refresh.
  const plaintextRefresh = readRefreshToken(account);
  try {
    const refreshed = await refreshFn(account, plaintextRefresh);
    const updated = await persistRefresh(account.id, refreshed);
    return { account: updated, accessToken: decryptToken(updated.accessToken) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Scrub anything token-shaped defensively before storing.
    const scrubbed = scrubTokens(msg);
    await recordAccountError(account.id, `Token refresh failed: ${scrubbed}`, true);
    throw new Error(`[tokenStore] ${platform} token refresh failed: ${scrubbed}`);
  }
}

/**
 * Best-effort scrub of long token-like substrings from a string before it is stored
 * or logged (defensive — platform error bodies sometimes echo the token).
 */
export function scrubTokens(input: string): string {
  return input
    // Bearer tokens
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, 'Bearer [REDACTED]')
    // enc:v1 envelopes
    .replace(/enc:v1:[0-9a-f:]+/gi, 'enc:v1:[REDACTED]')
    // long opaque token-ish blobs (>=24 chars of token alphabet)
    .replace(/[A-Za-z0-9._~+/=-]{24,}/g, '[REDACTED]');
}
