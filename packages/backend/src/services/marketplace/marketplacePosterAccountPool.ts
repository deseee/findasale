/**
 * marketplacePosterAccountPool.ts — account selection + pacing guard for the
 * Marketplace Poster (ADR-083).
 *
 * Rotates across MarketplacePosterAccount rows with status=ACTIVE, enforces a
 * per-account daily post cap, and moves an account to COOLDOWN once it hits the
 * cap for the day. Mirrors the per-account rate guard pattern already proven in
 * services/social/socialPublisherService.ts (dailyPostCap / publishedInLast24h),
 * adapted for a pool of dedicated FindA.Sale-owned accounts instead of one brand
 * account per platform.
 *
 * FLAGGED/BANNED accounts are never selected — see markAccountFlagged/markAccountBanned.
 */

import { prisma } from '../../lib/prisma';
import type { MarketplacePosterAccount } from '@prisma/client';

// Conservative starting cap — no official Meta guidance exists (no API), so this
// is a deliberately cautious ceiling to keep behavior human-plausible per account.
// Tune down further, not up, if any account gets FLAGGED at this volume.
const DAILY_POST_CAP_PER_ACCOUNT = 15;

/**
 * Pick the next available pool account for a job, round-robin by lastUsedAt
 * (oldest-used-first), skipping accounts at their daily cap.
 * Returns null if no ACTIVE account is available (caller should mark the job
 * SKIPPED, not FAILED — this is an expected "no pool registered yet" state,
 * not an error).
 */
export async function getNextAvailableAccount(): Promise<MarketplacePosterAccount | null> {
  await resetStaleDailyCounts();

  const candidates = await prisma.marketplacePosterAccount.findMany({
    where: {
      status: 'ACTIVE',
      dailyPostCount: { lt: DAILY_POST_CAP_PER_ACCOUNT },
    },
    orderBy: [{ lastUsedAt: 'asc' }],
    take: 1,
  });

  return candidates[0] ?? null;
}

/** Roll dailyPostCount back to 0 for any account whose 24h window has elapsed. */
async function resetStaleDailyCounts(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await prisma.marketplacePosterAccount.updateMany({
    where: { dailyCountResetAt: { lt: cutoff } },
    data: { dailyPostCount: 0, dailyCountResetAt: new Date() },
  });
}

/** Record a successful use of the account — increments daily count, stamps lastUsedAt. */
export async function recordAccountUse(accountId: string): Promise<void> {
  const account = await prisma.marketplacePosterAccount.findUnique({ where: { id: accountId } });
  if (!account) return;

  const nextCount = account.dailyPostCount + 1;
  await prisma.marketplacePosterAccount.update({
    where: { id: accountId },
    data: {
      lastUsedAt: new Date(),
      dailyPostCount: nextCount,
      // Move to COOLDOWN once the cap is hit — resetStaleDailyCounts() brings it
      // back to ACTIVE after 24h.
      status: nextCount >= DAILY_POST_CAP_PER_ACCOUNT ? 'COOLDOWN' : account.status,
    },
  });
}

/** Record a soft error (e.g. a single failed post) without flagging the account. */
export async function recordAccountError(accountId: string, message: string): Promise<void> {
  await prisma.marketplacePosterAccount.update({
    where: { id: accountId },
    data: { lastErrorAt: new Date(), lastErrorMessage: message.slice(0, 500) },
  });
}

/**
 * Mark an account FLAGGED — it hit a checkpoint/challenge and needs manual
 * review before reuse. Excluded from rotation immediately. Caller (the
 * Playwright client) should also fire a Sentry alert so Patrick knows to
 * register a replacement account.
 */
export async function markAccountFlagged(accountId: string, reason: string): Promise<void> {
  await prisma.marketplacePosterAccount.update({
    where: { id: accountId },
    data: { status: 'FLAGGED', lastErrorAt: new Date(), lastErrorMessage: reason.slice(0, 500) },
  });
}

/** Mark an account permanently BANNED — confirmed dead, never selected again. */
export async function markAccountBanned(accountId: string, reason: string): Promise<void> {
  await prisma.marketplacePosterAccount.update({
    where: { id: accountId },
    data: { status: 'BANNED', lastErrorAt: new Date(), lastErrorMessage: reason.slice(0, 500) },
  });
}
