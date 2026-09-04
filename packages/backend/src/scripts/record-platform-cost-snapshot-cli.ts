/**
 * record-platform-cost-snapshot-cli.ts — stdin-JSON CLI wrapper around
 * recordPlatformCostSnapshot.ts, so a non-TypeScript caller (the daily
 * "Ops & Cost Guard" scheduled task, which runs as a Claude Cowork skill with
 * bash + DB access but no import path into this backend's TS module graph)
 * can persist real Vercel/Railway cost line items without importing anything.
 *
 * ADR: claude_docs/feature-notes/ADR-2026-09-02-automated-410-tombstones-and-cost-snapshots.md
 *
 * This is the callable half of "wiring up" PlatformCostSnapshot. The
 * recurring daily invocation from inside the Ops & Cost Guard scheduled
 * task's own SKILL.md (which lives at a OneDrive path, not in this repo, and
 * is not reachable/editable from a Cowork VM session) is a separate
 * follow-up outside this dispatch's scope -- this script just needs to be
 * genuinely runnable via `npx tsx` with real stdin from any external caller,
 * including that scheduled task once it is updated to call it.
 *
 * Usage (from packages/backend, with DATABASE_URL set to the Railway proxy URL):
 *   echo '[{"date":"2026-09-04","provider":"vercel","metric":"isr_writes","quantity":362430,"costUsd":1.45}]' \
 *     | npx tsx src/scripts/record-platform-cost-snapshot-cli.ts
 *
 * Input: a JSON array on stdin. Each item: { date: "YYYY-MM-DD", provider:
 * "vercel"|"railway", metric: string, quantity: number, costUsd: number }.
 * `date` is parsed as UTC midnight for that calendar day, matching the
 * @@unique([date, provider, metric]) constraint's intent of "one row per
 * provider+metric per day" regardless of what time of day the scheduled task
 * happens to run. Safe to re-run for the same day -- upserts, never dupes.
 */

import { recordPlatformCostSnapshots, type PlatformCostSnapshotInput } from './recordPlatformCostSnapshot';

interface RawInput {
  date: string;
  provider: 'vercel' | 'railway';
  metric: string;
  quantity: number;
  costUsd: number;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf-8');
}

async function main(): Promise<void> {
  const raw = await readStdin();
  if (!raw.trim()) {
    console.error(
      '[record-platform-cost-snapshot-cli] no input on stdin -- expected a JSON array. See file header for usage.'
    );
    process.exitCode = 1;
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error('[record-platform-cost-snapshot-cli] stdin was not valid JSON:', err);
    process.exitCode = 1;
    return;
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    console.error('[record-platform-cost-snapshot-cli] expected a non-empty JSON array.');
    process.exitCode = 1;
    return;
  }

  const inputs: PlatformCostSnapshotInput[] = (parsed as RawInput[]).map((item, i) => {
    if (!item.date || !item.provider || !item.metric || item.quantity == null || item.costUsd == null) {
      throw new Error(
        `item[${i}] missing a required field (date/provider/metric/quantity/costUsd): ${JSON.stringify(item)}`
      );
    }
    if (item.provider !== 'vercel' && item.provider !== 'railway') {
      throw new Error(`item[${i}].provider must be "vercel" or "railway", got "${item.provider}"`);
    }
    return {
      date: new Date(`${item.date}T00:00:00.000Z`),
      provider: item.provider,
      metric: item.metric,
      quantity: item.quantity,
      costUsd: item.costUsd,
    };
  });

  await recordPlatformCostSnapshots(inputs);
  console.log(
    `[record-platform-cost-snapshot-cli] recorded ${inputs.length} snapshot row(s): ${inputs
      .map((i) => `${i.provider}/${i.metric}`)
      .join(', ')}`
  );
}

main()
  .catch((err) => {
    console.error('[record-platform-cost-snapshot-cli] failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    process.exit(process.exitCode ?? 0);
  });
