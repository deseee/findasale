/**
 * socialPublisherService.ts — the publish engine.
 *
 * publishDuePosts() is the orchestrator the cron calls each run. It:
 *   1. Finds SocialPost rows that are SCHEDULED (or DRAFT whose scheduledFor has
 *      arrived) and due, in a stable order.
 *   2. Enforces a generic per-account rate guard (Meta's 25/24h is future; the guard
 *      is written generically so a platform cap just supplies a number).
 *   3. Locks each row (status -> PUBLISHING) before the network call to prevent
 *      double-send across overlapping runs.
 *   4. Asserts platform routing (post.platform === account.platform) — a routing bug
 *      must never post X content through another account (ADR-077a invariant #7).
 *   5. Verifies the sourceHash guard (VALID-STATE-ONLY-EXPOSURE): a row whose
 *      approved content was edited after approval is skipped, not posted.
 *   6. Calls the platform publisher via the registry, records PUBLISHED (+remoteId,
 *      permalink) or increments attemptCount and records FAILED after N attempts.
 *      Rate-limit rejections set SKIPPED (retry next window), not FAILED.
 *
 * The engine acts ONLY on DB rows (never parses markdown) — the staging half that
 * materializes APPROVED markdown into DRAFT rows is a separate concern (ADR-077 §3).
 *
 * Errors are thrown up to cronGuard (Sentry) at the run level; per-post errors are
 * captured to the row AND to Sentry so one bad post never aborts the batch.
 */

import * as Sentry from '@sentry/node';
import { prisma } from '../../lib/prisma';
import type { SocialAccount, SocialPost, SocialPlatform } from '@prisma/client';
import { getPublisher } from './platforms';
import { getValidToken, recordAccountError, scrubTokens } from './tokenStore';

// After this many failed attempts, a post is marked FAILED (stops retrying).
const MAX_ATTEMPTS = 3;

// Generic per-account rate guard. Phase 1a has no hard platform cap wired (X's cap is
// a usage/billing concern, not a 24h post ceiling), so the default is null = no cap.
// Meta's 25/24h lands here in Phase 2 by returning 25 for FACEBOOK_PAGE/INSTAGRAM.
function dailyPostCap(_platform: SocialPlatform): number | null {
  return null;
}

/** How many posts this account has already PUBLISHED in the trailing 24h. */
async function publishedInLast24h(accountId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return prisma.socialPost.count({
    where: { accountId, status: 'PUBLISHED', publishedAt: { gte: since } },
  });
}

/**
 * Optional integrity guard: if a sourceHash is present, it must match a freshly
 * computed hash of the row's current body. A mismatch means the content was edited
 * after approval — do NOT post it. Returns true if safe to post.
 *
 * (Phase 1a stores sourceHash at staging time as the hash of the approved body; here
 * we recompute over the current body to detect post-approval mutation of the row.)
 */
function sourceHashIntact(post: SocialPost): boolean {
  if (!post.sourceHash) return true; // no guard recorded — nothing to verify
  const crypto = require('crypto') as typeof import('crypto');
  const current = crypto.createHash('sha256').update(post.body).digest('hex');
  return current === post.sourceHash;
}

/**
 * Publish all due posts. Returns a summary counted per outcome.
 */
export async function publishDuePosts(now: Date = new Date()): Promise<{
  considered: number;
  published: number;
  failed: number;
  skipped: number;
}> {
  const summary = { considered: 0, published: 0, failed: 0, skipped: 0 };

  // Hot query: SCHEDULED or due-DRAFT rows whose window has arrived. Uses the
  // @@index([status, scheduledFor]).
  const due = await prisma.socialPost.findMany({
    where: {
      status: { in: ['SCHEDULED', 'DRAFT'] },
      scheduledFor: { lte: now },
    },
    orderBy: { scheduledFor: 'asc' },
    take: 100, // bounded batch per run
    include: { account: true },
  });

  summary.considered = due.length;

  for (const post of due) {
    const account = post.account;

    try {
      // (a) Platform routing assertion — never post X content through another account.
      if (post.platform !== account.platform) {
        await markFailed(
          post.id,
          `Platform routing mismatch: post.platform=${post.platform} account.platform=${account.platform}`
        );
        summary.failed++;
        continue;
      }

      // (b) Account must be active and connected.
      if (!account.isActive) {
        await markSkipped(post.id, `Account for ${account.platform} inactive — needs reconnect`);
        summary.skipped++;
        continue;
      }

      // (c) sourceHash integrity — refuse edited-after-approval content.
      if (!sourceHashIntact(post)) {
        await markFailed(
          post.id,
          'sourceHash mismatch — content was edited after approval; not posting'
        );
        summary.failed++;
        continue;
      }

      // (d) Platform must have a live publisher module.
      const publisher = getPublisher(post.platform);
      if (!publisher) {
        await markSkipped(post.id, `Platform ${post.platform} not yet supported (no publisher)`);
        summary.skipped++;
        continue;
      }

      // (e) Generic per-account daily rate guard.
      const cap = dailyPostCap(account.platform);
      if (cap != null) {
        const sentToday = await publishedInLast24h(account.id);
        if (sentToday >= cap) {
          await markSkipped(
            post.id,
            `Daily cap reached for ${account.platform} (${sentToday}/${cap}); will retry next window`
          );
          summary.skipped++;
          continue;
        }
      }

      // (f) Lock the row BEFORE the network call (double-send guard).
      const locked = await lockForPublish(post.id);
      if (!locked) {
        // Another run grabbed it — skip silently.
        continue;
      }

      // (g) Get a valid (refreshed if needed) plaintext token, then publish.
      const { account: freshAccount, accessToken } = await getValidToken(
        account.platform,
        publisher.refresh
      );

      const result = await publisher.publish({ post, account: freshAccount, accessToken });

      await prisma.socialPost.update({
        where: { id: post.id },
        data: {
          status: 'PUBLISHED',
          remotePostId: result.remotePostId,
          permalink: result.permalink ?? null,
          publishedAt: new Date(),
          lastAttemptAt: new Date(),
          lastErrorMessage: null,
        },
      });
      summary.published++;
    } catch (err) {
      summary.failed += await handlePublishError(post, account, err);
    }
  }

  console.log(
    `[socialPublisher] considered=${summary.considered} published=${summary.published} ` +
      `failed=${summary.failed} skipped=${summary.skipped}`
  );
  return summary;
}

/**
 * Atomically move a post to PUBLISHING only if it is still SCHEDULED/DRAFT.
 * Returns true if this run won the lock.
 */
async function lockForPublish(postId: string): Promise<boolean> {
  const res = await prisma.socialPost.updateMany({
    where: { id: postId, status: { in: ['SCHEDULED', 'DRAFT'] } },
    data: { status: 'PUBLISHING', lastAttemptAt: new Date(), attemptCount: { increment: 1 } },
  });
  return res.count === 1;
}

async function markFailed(postId: string, message: string): Promise<void> {
  await prisma.socialPost.update({
    where: { id: postId },
    data: { status: 'FAILED', lastErrorMessage: scrubTokens(message).slice(0, 1000), lastAttemptAt: new Date() },
  });
}

async function markSkipped(postId: string, message: string): Promise<void> {
  await prisma.socialPost.update({
    where: { id: postId },
    data: { status: 'SKIPPED', lastErrorMessage: scrubTokens(message).slice(0, 1000), lastAttemptAt: new Date() },
  });
}

/**
 * Handle a thrown publish error: increment/inspect attempts, decide FAILED vs retry,
 * capture to Sentry and the row. Returns 1 if the post ended FAILED (for the summary),
 * else 0 (it will retry).
 */
async function handlePublishError(
  post: SocialPost,
  account: SocialAccount,
  err: unknown
): Promise<number> {
  const raw = err instanceof Error ? err.message : String(err);
  const message = scrubTokens(raw).slice(0, 1000);

  // Re-read the current attemptCount (lockForPublish may have incremented it).
  const current = await prisma.socialPost.findUnique({
    where: { id: post.id },
    select: { attemptCount: true },
  });
  const attempts = current?.attemptCount ?? post.attemptCount;

  const isRateLimited = /rate.?limit|429|too many requests/i.test(raw);

  try {
    // SECURITY (ADR-077a invariant #2): NEVER hand the raw error to Sentry — axios
    // error messages/response bodies from a platform can echo the bearer/refresh token.
    // Send a scrubbed Error only; do NOT attach the original err or any response body.
    const scrubbedErr = new Error(message);
    scrubbedErr.name = err instanceof Error ? err.name : 'SocialPublishError';
    Sentry.captureException(scrubbedErr, {
      tags: { feature: 'socialPublisher', platform: post.platform, postId: post.id },
      extra: { attempts, accountId: account.id },
      level: 'error',
    });
  } catch {
    // Sentry not ready — continue.
  }

  if (isRateLimited) {
    // Not a failure — retry next window.
    await prisma.socialPost.update({
      where: { id: post.id },
      data: { status: 'SKIPPED', lastErrorMessage: message, lastAttemptAt: new Date() },
    });
    return 0;
  }

  if (attempts >= MAX_ATTEMPTS) {
    await prisma.socialPost.update({
      where: { id: post.id },
      data: { status: 'FAILED', lastErrorMessage: message, lastAttemptAt: new Date() },
    });
    return 1;
  }

  // Retry: drop back to SCHEDULED so the next run picks it up.
  await prisma.socialPost.update({
    where: { id: post.id },
    data: { status: 'SCHEDULED', lastErrorMessage: message, lastAttemptAt: new Date() },
  });

  // Best-effort: surface an auth-shaped failure onto the account too.
  if (/token|unauthor|401|403/i.test(raw)) {
    await recordAccountError(account.id, `Publish auth error: ${message}`).catch(() => {});
  }
  return 0;
}
