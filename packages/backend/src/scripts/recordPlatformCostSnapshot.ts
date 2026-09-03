/**
 * recordPlatformCostSnapshot.ts — writes/upserts one PlatformCostSnapshot row.
 *
 * ADR: claude_docs/feature-notes/ADR-2026-09-02-automated-410-tombstones-and-cost-snapshots.md
 *
 * Reusable helper for persisting a single cost/usage line item read from an
 * external dashboard (Vercel Usage, Railway metrics) into a queryable table,
 * instead of only narrating the number into STATE.md prose. Intended caller:
 * the daily "Ops & Cost Guard" scheduled task, once per metric it already
 * reads each run (see ADR Part 2 for the list of metrics and the "build now
 * vs. flag for later" scope decision -- this script is the "build now" half;
 * wiring it into the scheduled task's own routine is a follow-up for
 * findasale-records / the scheduled-task skill, not this dispatch).
 *
 * Usage (from a Node/ts-node context with DATABASE_URL set):
 *   import { recordPlatformCostSnapshot } from './recordPlatformCostSnapshot';
 *   await recordPlatformCostSnapshot({
 *     date: new Date('2026-09-02T00:00:00Z'),
 *     provider: 'vercel',
 *     metric: 'observability_events',
 *     quantity: 5630000,
 *     costUsd: 6.76,
 *   });
 *
 * Safe to call more than once for the same [date, provider, metric] -- the
 * unique constraint means a re-run same-day upserts rather than duplicates.
 */

import { prisma } from '../lib/prisma';

export interface PlatformCostSnapshotInput {
  date: Date;
  provider: 'vercel' | 'railway';
  metric: string;
  quantity: number;
  costUsd: number;
}

export async function recordPlatformCostSnapshot(input: PlatformCostSnapshotInput): Promise<void> {
  const { date, provider, metric, quantity, costUsd } = input;
  await prisma.platformCostSnapshot.upsert({
    where: { date_provider_metric: { date, provider, metric } },
    create: { date, provider, metric, quantity, costUsd },
    update: { quantity, costUsd },
  });
}

/**
 * Convenience batch helper -- record several metrics for the same day/provider
 * in one call (matches how the ops-guard task reads several line items from
 * one dashboard visit).
 */
export async function recordPlatformCostSnapshots(inputs: PlatformCostSnapshotInput[]): Promise<void> {
  for (const input of inputs) {
    await recordPlatformCostSnapshot(input);
  }
}
