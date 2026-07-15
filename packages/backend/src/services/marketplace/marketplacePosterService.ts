/**
 * marketplacePosterService.ts — the Marketplace Poster orchestrator (ADR-083).
 *
 * Two responsibilities:
 *   1. enqueue*() — cheap, fire-and-forget helpers called from itemController
 *      (on publish) and facebookNudgeService (on sale) to create QUEUED jobs.
 *      Never throw — a queueing failure must never block the caller's main
 *      action (item publish / sale processing), mirroring enqueueFetchEbayComps.
 *   2. processDueJobs() — the engine the cron calls each run. Picks up QUEUED
 *      jobs, locks each row (status -> RUNNING) before the browser call to
 *      prevent double-processing across overlapping runs, and resolves to
 *      POSTED/REMOVED, FAILED (after MAX_ATTEMPTS), or SKIPPED (no pool
 *      account available yet — expected state until Patrick registers one,
 *      see ADR-083 "Flagged for Patrick", NOT an error).
 *
 * Mirrors services/social/socialPublisherService.ts (publishDuePosts) —
 * same lock-before-call, same attempt-counting, same Sentry-at-run-level /
 * row-level-error-capture split.
 */

import * as Sentry from '@sentry/node';
import { prisma } from '../../lib/prisma';
import { getNextAvailableAccount, recordAccountUse, recordAccountError, markAccountFlagged } from './marketplacePosterAccountPool';
import { postListing, removeListing } from './marketplacePlaywrightClient';

const MAX_ATTEMPTS = 3;

/**
 * Queue a POST job for an item, IF its organizer has opted in
 * (organizer.marketplaceAutoPostEnabled). Called from itemController.publishItem
 * right after a successful publish — fire-and-forget, never throws.
 */
export async function enqueueMarketplacePostJob(itemId: string): Promise<void> {
  try {
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        sale: { select: { organizer: { select: { marketplaceAutoPostEnabled: true } } } },
      },
    });

    if (!item?.sale?.organizer?.marketplaceAutoPostEnabled) {
      return; // opt-in feature — do nothing unless the organizer has turned it on
    }

    await prisma.marketplaceListingJob.create({
      data: { itemId, action: 'POST', status: 'QUEUED' },
    });
  } catch (err) {
    console.warn(`[marketplace-poster] Failed to enqueue POST job for item ${itemId}:`, err);
  }
}

/**
 * Queue a REMOVE job for an item IF it has a previously POSTED
 * MarketplaceListingJob. Called from facebookNudgeService.notifyFacebookExportedItemSold
 * — the single shared chokepoint already used by all 11 sold-trigger call sites,
 * so this closes the "not quite automated" gap without touching each call site.
 * Fire-and-forget, never throws.
 */
export async function enqueueMarketplaceRemoveJobIfPosted(itemId: string): Promise<void> {
  try {
    const postedJob = await prisma.marketplaceListingJob.findFirst({
      where: { itemId, action: 'POST', status: 'POSTED' },
      orderBy: { createdAt: 'desc' },
    });

    if (!postedJob || !postedJob.remoteListingId) {
      return; // never auto-posted (or posted but no remote id captured) — nothing to remove
    }

    // Avoid double-queueing a REMOVE for the same posted job
    const existingRemove = await prisma.marketplaceListingJob.findFirst({
      where: { itemId, action: 'REMOVE', status: { in: ['QUEUED', 'RUNNING', 'REMOVED'] } },
    });
    if (existingRemove) return;

    await prisma.marketplaceListingJob.create({
      data: {
        itemId,
        action: 'REMOVE',
        status: 'QUEUED',
        remoteListingId: postedJob.remoteListingId,
      },
    });
  } catch (err) {
    console.warn(`[marketplace-poster] Failed to enqueue REMOVE job for item ${itemId}:`, err);
  }
}

/** The engine the cron calls each run. Processes all currently-due QUEUED jobs. */
export async function processDueJobs(): Promise<void> {
  const jobs = await prisma.marketplaceListingJob.findMany({
    where: { status: 'QUEUED', scheduledFor: { lte: new Date() } },
    orderBy: { scheduledFor: 'asc' },
    take: 20, // cap per run — pacing delay between each keeps a run from stacking up
    include: { item: true },
  });

  for (const job of jobs) {
    await processOneJob(job.id);
    // Human-like pacing between accounts/actions — imported lazily to keep this
    // file's import graph simple; see marketplacePlaywrightClient.randomPacingDelayMs.
    const { randomPacingDelayMs } = await import('./marketplacePlaywrightClient');
    await new Promise((resolve) => setTimeout(resolve, randomPacingDelayMs()));
  }
}

async function processOneJob(jobId: string): Promise<void> {
  // Lock the row before any network/browser call — prevents double-processing
  // across overlapping cron runs (same guard pattern as socialPublisherService).
  const locked = await prisma.marketplaceListingJob.updateMany({
    where: { id: jobId, status: 'QUEUED' },
    data: { status: 'RUNNING', lastAttemptAt: new Date() },
  });
  if (locked.count === 0) return; // another run already picked this up

  const job = await prisma.marketplaceListingJob.findUnique({ where: { id: jobId }, include: { item: true } });
  if (!job) return;

  const account = await getNextAvailableAccount();
  if (!account) {
    // Expected state until Patrick registers a pool account — SKIPPED, not FAILED.
    await prisma.marketplaceListingJob.update({
      where: { id: jobId },
      data: { status: 'SKIPPED', lastErrorMessage: 'No ACTIVE MarketplacePosterAccount available.' },
    });
    return;
  }

  try {
    if (job.action === 'POST') {
      const result = await postListing(account, {
        title: job.item.title,
        price: job.item.price ?? 0,
        description: job.item.description ?? '',
        photoUrls: job.item.photoUrls,
        category: job.item.category ?? undefined,
      });
      await prisma.marketplaceListingJob.update({
        where: { id: jobId },
        data: { status: 'POSTED', accountId: account.id, remoteListingId: result.remoteListingId },
      });
    } else {
      if (!job.remoteListingId) {
        throw new Error('REMOVE job missing remoteListingId — cannot remove.');
      }
      await removeListing(account, job.remoteListingId);
      await prisma.marketplaceListingJob.update({
        where: { id: jobId },
        data: { status: 'REMOVED', accountId: account.id },
      });
    }
    await recordAccountUse(account.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordAccountError(account.id, message);

    const nextAttemptCount = job.attemptCount + 1;
    const isFinalAttempt = nextAttemptCount >= MAX_ATTEMPTS;

    await prisma.marketplaceListingJob.update({
      where: { id: jobId },
      data: {
        status: isFinalAttempt ? 'FAILED' : 'QUEUED', // retry unless attempts exhausted
        attemptCount: nextAttemptCount,
        lastErrorMessage: message.slice(0, 500),
      },
    });

    // A challenge/checkpoint-style error should flag the account, not just the job —
    // heuristic on the error message; refine once real Marketplace error text is known
    // (evidence-first: this codepath has no live account to observe yet, see ADR-083).
    if (/checkpoint|challenge|verify your identity|suspicious/i.test(message)) {
      await markAccountFlagged(account.id, message);
      Sentry.captureMessage(`[marketplace-poster] Account ${account.label} FLAGGED: ${message}`, 'warning');
    }

    if (isFinalAttempt) {
      Sentry.captureException(err, { tags: { job: 'marketplacePoster', jobId } });
    }
  }
}
