// One-time backfill: Item.restrictedClass for existing items (2026-11-06, Finix restricted-item card blocking).
//
// ─── Why this exists ──────────────────────────────────────────────────────────────────
// Migration z20261106000000_finix_restricted_item_blocking adds Item.restrictedClass with every existing row at
// 'NONE' and restrictedClassifiedAt NULL ("stale"). Correctness does NOT depend on this script: the payment gate
// (src/services/restrictedItem/cardPaymentGate.ts) reclassifies any stale row before deciding a card payment. This
// script classifies the rest up front so admin views, the audit log and reports are complete, and so the first card
// payment for an old item does not pay the reclassification cost.
//
// Also the path for a classifier rule change: bump RESTRICTED_CLASSIFIER_VERSION, deploy, run this with --all-versions.
//
// ─── Scope ────────────────────────────────────────────────────────────────────────────
// Default: rows with restrictedClassifiedAt IS NULL. --all-versions: also rows classified by an older classifier
// version. Keyset pagination on id, in batches (default 500), so it can be stopped and re-run at any time: each batch
// only touches rows still stale. Every write is compare-and-set on the classifier inputs
// (restrictedClassStore.reclassifyRow) and the ratchet never lowers an existing class. Admin overrides are untouched.
// Every class change is audited by the database trigger "Item_restricted_class_audit" (source 'BACKFILL').
// Deterministic keywords + category only: no model calls, no paid API calls, no network.
//
// ─── Usage (from packages/backend, DATABASE_URL pointing at the database to backfill) ─────
//   npx tsx scripts/backfillRestrictedItemClass.ts                 # DRY RUN: counts + per-class tally, writes nothing
//   npx tsx scripts/backfillRestrictedItemClass.ts --apply         # writes
//   npx tsx scripts/backfillRestrictedItemClass.ts --apply --batch 200 --limit 5000 --all-versions
//
// NOT RUN by the session that wrote it. Run only after the migration is deployed.

import { PrismaClient } from '@prisma/client';
import { classifyRestrictedItem, applyAutoRatchet, isRestrictedItemClassName, RESTRICTED_CLASSIFIER_VERSION } from '../src/services/restrictedItem/restrictedItemClassifier';
import { readItemClassificationRows, reclassifyRow, type RawSqlClient } from '../src/services/restrictedItem/restrictedClassStore';

const prisma = new PrismaClient();
const db = prisma as unknown as RawSqlClient;

const APPLY = process.argv.includes('--apply');
const ALL_VERSIONS = process.argv.includes('--all-versions');
const numArg = (flag: string, fallback: number) => {
  const i = process.argv.indexOf(flag);
  const n = i !== -1 ? parseInt(process.argv[i + 1], 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const BATCH = Math.min(numArg('--batch', 500), 500);
const LIMIT = numArg('--limit', Number.MAX_SAFE_INTEGER);

async function main() {
  console.log(`[backfillRestrictedItemClass] mode=${APPLY ? 'APPLY' : 'DRY RUN'} version=${RESTRICTED_CLASSIFIER_VERSION} batch=${BATCH} allVersions=${ALL_VERSIONS}`);
  const tally: Record<string, number> = {};
  let processed = 0;
  let raised = 0;
  let casLost = 0;
  let cursor = '';
  while (processed < LIMIT) {
    const ids = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Item"
      WHERE "id" > ${cursor}
        AND ("restrictedClassifiedAt" IS NULL
             OR (${ALL_VERSIONS} AND "restrictedClassifierVersion" IS DISTINCT FROM ${RESTRICTED_CLASSIFIER_VERSION}))
      ORDER BY "id" ASC
      LIMIT ${Math.min(BATCH, LIMIT - processed)}
    `;
    if (ids.length === 0) break;
    cursor = ids[ids.length - 1].id;
    const rows = await readItemClassificationRows(db, ids.map((r) => r.id));
    for (const row of rows) {
      const before = isRestrictedItemClassName(row.restrictedClass) ? row.restrictedClass : 'NONE';
      let after: string;
      if (APPLY) {
        const out = await reclassifyRow(db, row, 'BACKFILL');
        after = out.storedClass;
        if (!out.persisted) casLost += 1;
      } else {
        const auto = classifyRestrictedItem(row).restrictedClass;
        after = applyAutoRatchet(before, auto);
      }
      tally[after] = (tally[after] ?? 0) + 1;
      if (after !== before) raised += 1;
    }
    processed += rows.length;
    console.log(`[backfillRestrictedItemClass] processed=${processed} lastId=${cursor}`);
  }
  console.log('[backfillRestrictedItemClass] done', { processed, changed: raised, casLostToConcurrentEdit: casLost, byClass: tally });
  if (!APPLY) console.log('[backfillRestrictedItemClass] DRY RUN: nothing was written. Re-run with --apply to write.');
}

main()
  .catch((err) => {
    console.error('[backfillRestrictedItemClass] FAILED:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
