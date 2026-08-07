/**
 * cronCursor.ts — Resumable-position store for long-running backfill/backlog batch jobs.
 *
 * Root cause this fixes: emailDiscoveryBatchJob (emailDiscoveryService.ts), the lead-scoring
 * backfill (leadScoringService.ts), and the website-enrichment backfill (websiteEnrichmentJob.ts)
 * each held their pagination cursor only in a local variable. Every Railway redeploy
 * (multiple/day) killed the job mid-run and the next invocation restarted from row 1 -- a
 * ~14k-row backlog never actually advanced (2026-08-05 production timing data, see
 * emailDiscoveryBatchJob's CONCURRENCY comment).
 *
 * Backed by the CronCursor table (packages/database/prisma/schema.prisma). Callers:
 *   - read the cursor once at the top of a job run to resume where the last run left off,
 *   - upsert it after each successfully-processed batch (so a mid-run redeploy resumes there),
 *   - clear it when a job runs to full completion (so the NEXT scheduled run starts a fresh
 *     pass over the table instead of resuming a "finished" position).
 *
 * `cursor` is opaque and job-specific -- see the schema.prisma comment on CronCursor. This
 * module does not interpret the string; callers own that (id-cursor vs. offset, etc.).
 *
 * FAIL OPEN on read errors (return null -> caller starts from the beginning) and FAIL SAFE on
 * write errors (log + continue) -- same policy as domainFetchState.ts. A cursor-store outage
 * must never block or crash the underlying job.
 */

import { prisma } from './prisma';

/**
 * Read the persisted cursor for a job. Returns null if no row exists yet, if the stored cursor
 * is itself null (e.g. the job previously completed a full pass and was cleared), or on any DB
 * read error. Never throws -- a null return always means "start from the beginning."
 */
export async function getCronCursor(jobName: string): Promise<string | null> {
  try {
    const row = await prisma.cronCursor.findUnique({ where: { jobName } });
    return row?.cursor ?? null;
  } catch (err) {
    console.warn(
      `[cronCursor] getCronCursor read failed for ${jobName} (failing open -- starting from beginning):`,
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

/**
 * Persist the cursor after a successfully-processed batch. `rowsProcessed` is observability
 * only (the batch size just processed). Never throws -- logs and continues on write failure so
 * a cursor-store outage can never crash the underlying job.
 */
export async function saveCronCursor(
  jobName: string,
  cursor: string | null,
  rowsProcessed?: number
): Promise<void> {
  try {
    await prisma.cronCursor.upsert({
      where: { jobName },
      create: { jobName, cursor, rowsProcessedLastRun: rowsProcessed ?? null },
      update: { cursor, rowsProcessedLastRun: rowsProcessed ?? null },
    });
  } catch (err) {
    console.warn(
      `[cronCursor] saveCronCursor write failed for ${jobName}:`,
      err instanceof Error ? err.message : String(err)
    );
  }
}

/**
 * Clear the cursor when a job runs to full completion, so the next scheduled run starts a fresh
 * pass over the table instead of resuming from a "finished" position. Never throws.
 */
export async function clearCronCursor(jobName: string): Promise<void> {
  try {
    await prisma.cronCursor.upsert({
      where: { jobName },
      create: { jobName, cursor: null, rowsProcessedLastRun: 0 },
      update: { cursor: null },
    });
  } catch (err) {
    console.warn(
      `[cronCursor] clearCronCursor write failed for ${jobName}:`,
      err instanceof Error ? err.message : String(err)
    );
  }
}
