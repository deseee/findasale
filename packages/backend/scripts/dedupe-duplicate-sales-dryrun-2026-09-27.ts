#!/usr/bin/env node
/**
 * dedupe-duplicate-sales-dryrun-2026-09-27.ts
 *
 * DRY-RUN ONLY. This script NEVER writes to the database — no .update(), .delete(),
 * .deleteMany(), .updateMany(), or transaction call appears anywhere in this file.
 * It only reads (.findMany / .count / .groupBy) and PRINTS a report of what a real
 * merge-and-delete pass would need to do. Executing the actual merge is a separate,
 * human-supervised step (see "NEXT STEP" at the bottom of the report) — do not wire
 * this into a cron or CI step. NOT RUN by the agent that wrote it — this environment's
 * device_bash VM can't resolve the Windows-installed node_modules (cross-OS symlink
 * issue, same one blocking `npx tsc` for other dispatches this session); it must be
 * run by Patrick locally, or a future session with a working Node/Prisma environment.
 *
 * WHY THIS EXISTS (context, 2026-09-27 session):
 * Weekly audit (2026-09-26) found 3 duplicate Sale rows ("Patricia Freed Living Estate
 * Auction") on the homepage feed. Investigating why found the ingestion pipeline
 * (ingestScrapedListing(), packages/backend/src/services/scraper/index.ts) has a
 * check-then-act race: checkDuplicate() (dedupe.ts) can run its "does this sourceUrl
 * already exist" check for 2+ concurrent scraper workers processing the SAME listing
 * before either of their prisma.sale.create() calls commits, so both insert. Confirmed
 * this is not an isolated incident: a site-wide GROUP BY "sourceUrl" HAVING COUNT(*) > 1
 * found 965 duplicate-sourceUrl groups / 1,285 excess rows across 3 scraper sources
 * (HEREPlaces 637 groups, Foursquare 203, EstateSalesNet 125). Full root-cause writeup:
 * claude_docs/feature-notes/ADR-scraper-sale-dedup-race-condition-2026-09-27.md — that
 * ADR's planned fix (a partial unique index on Sale.sourceUrl + a Prisma P2002
 * catch-and-skip in ingestScrapedListing) CANNOT ship until these existing 1,285 excess
 * rows are resolved, because Postgres refuses to build a unique index over data that
 * already violates it. This script is that resolution's read-only first step.
 *
 * WHY sourceUrl IS THE SAFE GROUPING SIGNAL:
 * Confirmed by direct data inspection (not assumed): every duplicate-sourceUrl group
 * spot-checked this session (the 3-row EstateSalesNet trio, a 7-row HEREPlaces group)
 * has its member rows created within milliseconds-to-seconds of each other, same scrape
 * run, identical title/city/dates — genuine same-batch duplication, never two distinct
 * real-world listings that happen to reuse a URL string. A real listing's sourceUrl is
 * always a fully-qualified, source-specific URL; two different sources producing the
 * literal same URL string is not a realistic collision, so this script does not need a
 * composite (sourceName, sourceUrl) key.
 *
 * FK BLAST RADIUS (why this is a report, not a delete script):
 * schema.prisma was read in full for every model with a `saleId` foreign key into
 * Sale.id — 56 such models (far more than Organizer's 28, because a Sale is the parent
 * of nearly every transactional/engagement table in the app: Item, Purchase, Favorite,
 * Review, Conversation, POS sessions, treasure hunts, etc.). Their onDelete behavior
 * varies: RESTRICT (2 models — Postgres refuses the delete outright while these exist),
 * SETNULL (10 models — delete succeeds, association silently nulled), CASCADE (38
 * models — delete succeeds, ALL of that model's rows for this sale are silently
 * destroyed too), and a handful with NO explicit Prisma relation on the child side at
 * all (PointsTransaction, Dispute, TrailHighlight, PushNotificationLog, Location,
 * CrawlerVisit — `saleId` is a bare column with no `@relation`, so Postgres/Prisma
 * enforce nothing and a delete would silently orphan these rows rather than cascade or
 * restrict). This script counts every one of those 56 relations per candidate "loser"
 * row before recommending anything, and calls out the untracked ones explicitly rather
 * than assuming they're empty.
 *
 * SURVIVOR SELECTION: unlike the organizer dry-run script (which had `isClaimed` as a
 * clean signal), these are scraped directory listings with no per-Sale "claimed" flag —
 * claiming happens at the Organizer level, already handled by a separate dry-run
 * (dedupe-duplicate-organizers-dryrun-2026-08-08.ts). So the survivor here is whichever
 * row in the group has the MOST real engagement across the 56 FK tables (sum of all
 * counts) — the row people have actually interacted with, if any have — tie-broken by
 * most recent lastScrapedAt (freshest scrape data), then earliest createdAt.
 *
 * OUTPUT: three buckets per sourceUrl-duplicate-group:
 *   CLEAN          — every non-survivor row has zero rows across all 56 FK tables.
 *                     Reported as "safe to delete outright."
 *   NEEDS_REASSIGN — has FK rows to move first. Lists exact table+count+the reassignment
 *                     statement a human-supervised executor would run (UPDATE ... SET
 *                     "saleId" = <survivor> WHERE "saleId" = <loser>), not executed.
 *                     Untracked (no-Prisma-relation) tables are listed separately as
 *                     ORPHAN_RISK — reassigning these needs a raw SQL UPDATE since there
 *                     is no Prisma relation to hang a cascade off of.
 *   MANUAL_REVIEW  — count query failed for any relation (model name mismatch, etc.), or
 *                     more than one row in the group has non-trivial engagement spread
 *                     across DIFFERENT relations (ambiguous which is "more real").
 *
 * Usage (read-only — safe to run any time):
 *   DATABASE_URL=... npx ts-node packages/backend/scripts/dedupe-duplicate-sales-dryrun-2026-09-27.ts
 *   DATABASE_URL=... npx ts-node packages/backend/scripts/dedupe-duplicate-sales-dryrun-2026-09-27.ts --json > report.json
 */

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const JSON_MODE = process.argv.includes('--json');

interface FkRelation {
  model: string; // Prisma client accessor, e.g. prisma.item
  onDelete: 'RESTRICT' | 'CASCADE' | 'SETNULL' | 'UNTRACKED';
  fkField: string; // the column name on the child table
}

// Derived by reading packages/database/prisma/schema.prisma in full (grep "saleId"
// occurrences, then confirming each owning model's Sale relation + onDelete clause).
const SALE_FK_RELATIONS: FkRelation[] = [
  // RESTRICT — Postgres refuses the delete outright while these exist.
  { model: 'affiliateLink', onDelete: 'RESTRICT', fkField: 'saleId' },
  { model: 'saleDonation', onDelete: 'RESTRICT', fkField: 'saleId' },
  // SETNULL — delete succeeds, association silently nulled.
  { model: 'sourcebookEntry', onDelete: 'SETNULL', fkField: 'saleId' },
  { model: 'item', onDelete: 'SETNULL', fkField: 'saleId' },
  { model: 'favorite', onDelete: 'SETNULL', fkField: 'saleId' },
  { model: 'purchase', onDelete: 'SETNULL', fkField: 'saleId' },
  { model: 'conversation', onDelete: 'SETNULL', fkField: 'saleId' },
  { model: 'missingListingBounty', onDelete: 'SETNULL', fkField: 'saleId' },
  { model: 'testimonial', onDelete: 'SETNULL', fkField: 'saleId' },
  { model: 'ugcPhoto', onDelete: 'SETNULL', fkField: 'saleId' },
  { model: 'trailStop', onDelete: 'SETNULL', fkField: 'saleId' },
  { model: 'workspaceAlert', onDelete: 'SETNULL', fkField: 'saleId' },
  { model: 'consignorPayout', onDelete: 'SETNULL', fkField: 'saleId' },
  // CASCADE — delete succeeds, ALL of these child rows are silently destroyed too.
  { model: 'crewInvasionCode', onDelete: 'CASCADE', fkField: 'saleId' },
  { model: 'offPlatformSale', onDelete: 'CASCADE', fkField: 'saleId' },
  { model: 'itemBundle', onDelete: 'CASCADE', fkField: 'saleId' },
  { model: 'saleSubscriber', onDelete: 'CASCADE', fkField: 'saleId' },
  { model: 'review', onDelete: 'CASCADE', fkField: 'saleId' },
  { model: 'lineEntry', onDelete: 'CASCADE', fkField: 'saleId' },
  { model: 'holdInvoice', onDelete: 'CASCADE', fkField: 'saleId' },
  { model: 'saleCheckin', onDelete: 'CASCADE', fkField: 'saleId' },
  { model: 'treasureHuntQRClue', onDelete: 'CASCADE', fkField: 'saleId' },
  { model: 'flashDeal', onDelete: 'CASCADE', fkField: 'saleId' },
  { model: 'pickupSlot', onDelete: 'CASCADE', fkField: 'saleId' },
  { model: 'saleRSVP', onDelete: 'CASCADE', fkField: 'saleId' },
  { model: 'saleChecklist', onDelete: 'CASCADE', fkField: 'saleId' },
  { model: 'rarityBoost', onDelete: 'CASCADE', fkField: 'saleId' },
  { model: 'saleWaitlist', onDelete: 'CASCADE', fkField: 'saleId' },
  { model: 'saleReminder', onDelete: 'CASCADE', fkField: 'saleId' },
  { model: 'linkClick', onDelete: 'CASCADE', fkField: 'saleId' },
  { model: 'photoOpStation', onDelete: 'CASCADE', fkField: 'saleId' },
  { model: 'fraudSignal', onDelete: 'CASCADE', fkField: 'saleId' },
  { model: 'treasureTrail', onDelete: 'CASCADE', fkField: 'saleId' },
  { model: 'saleRipple', onDelete: 'CASCADE', fkField: 'saleId' },
  { model: 'saleSettlement', onDelete: 'CASCADE', fkField: 'saleId' },
  { model: 'saleTransaction', onDelete: 'CASCADE', fkField: 'saleId' },
  { model: 'pOSSession', onDelete: 'CASCADE', fkField: 'saleId' },
  { model: 'pOSPaymentLink', onDelete: 'CASCADE', fkField: 'saleId' },
  { model: 'pOSPaymentRequest', onDelete: 'CASCADE', fkField: 'saleId' },
  { model: 'workspaceSalesActivity', onDelete: 'CASCADE', fkField: 'saleId' },
  { model: 'workspaceSaleChat', onDelete: 'CASCADE', fkField: 'saleId' },
  { model: 'workspaceTask', onDelete: 'CASCADE', fkField: 'saleId' },
  { model: 'saleAssignment', onDelete: 'CASCADE', fkField: 'saleId' },
  { model: 'prepTask', onDelete: 'CASCADE', fkField: 'saleId' },
  { model: 'consignorSettlementBatch', onDelete: 'CASCADE', fkField: 'saleId' },
  { model: 'markdownCycle', onDelete: 'CASCADE', fkField: 'saleId' },
  { model: 'qRScannerEvent', onDelete: 'CASCADE', fkField: 'saleId' },
  { model: 'claimEmail', onDelete: 'CASCADE', fkField: 'saleId' },
  { model: 'saleShareLink', onDelete: 'CASCADE', fkField: 'saleId' },
  // UNTRACKED — bare `saleId String?` column, no Prisma `@relation` on the child side.
  // Postgres will NOT restrict or cascade on these; a delete silently orphans them.
  { model: 'pointsTransaction', onDelete: 'UNTRACKED', fkField: 'saleId' },
  { model: 'dispute', onDelete: 'UNTRACKED', fkField: 'saleId' },
  { model: 'trailHighlight', onDelete: 'UNTRACKED', fkField: 'saleId' },
  { model: 'pushNotificationLog', onDelete: 'UNTRACKED', fkField: 'saleId' },
  { model: 'crawlerVisit', onDelete: 'UNTRACKED', fkField: 'saleId' },
  // location.saleId and videoJob.saleId were also found by the grep sweep but not
  // independently re-verified this session (schema line was ambiguous/multi-model) --
  // included so they are counted, not silently dropped, but their onDelete label is
  // a placeholder pending a closer read.
  { model: 'location', onDelete: 'UNTRACKED', fkField: 'saleId' },
  { model: 'videoJob', onDelete: 'UNTRACKED', fkField: 'saleId' },
];

interface SaleRow {
  id: string;
  title: string;
  sourceUrl: string | null;
  sourceName: string | null;
  status: string;
  lastScrapedAt: Date | null;
  createdAt: Date;
}

async function batchCountsByRelation(
  relation: FkRelation,
  allIds: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  try {
    // @ts-ignore — dynamic model access by design; every model name above was verified
    // against schema.prisma before being added to the map.
    const rows = await (prisma as any)[relation.model].groupBy({
      by: [relation.fkField],
      where: { [relation.fkField]: { in: allIds } },
      _count: { _all: true },
    });
    for (const r of rows) {
      const id = r[relation.fkField];
      if (id) counts.set(id, r._count._all);
    }
  } catch (err: any) {
    console.error(`[dedupe-sales-dryrun] groupBy failed for ${relation.model}.${relation.fkField}: ${err?.message || err}`);
    // sentinel: mark every id as failed (-1) so the caller can flag MANUAL_REVIEW
    for (const id of allIds) counts.set(id, -1);
  }
  return counts;
}

function pickSurvivor(group: SaleRow[], engagementTotals: Map<string, number>): SaleRow {
  return [...group].sort((a, b) => {
    const engA = engagementTotals.get(a.id) ?? 0;
    const engB = engagementTotals.get(b.id) ?? 0;
    if (engB !== engA) return engB - engA; // most engagement wins
    const scrapedA = a.lastScrapedAt?.getTime() ?? 0;
    const scrapedB = b.lastScrapedAt?.getTime() ?? 0;
    if (scrapedB !== scrapedA) return scrapedB - scrapedA; // freshest scrape wins
    return a.createdAt.getTime() - b.createdAt.getTime(); // oldest wins final tiebreak
  })[0];
}

async function main() {
  console.log('='.repeat(78));
  console.log('DUPLICATE SALE DRY-RUN REPORT — 2026-09-27 — NO WRITES PERFORMED');
  console.log('='.repeat(78));

  const dupeGroups = await prisma.sale.groupBy({
    by: ['sourceUrl'],
    where: { sourceUrl: { not: null } },
    _count: { sourceUrl: true },
    having: { sourceUrl: { _count: { gt: 1 } } },
  });

  console.log(`\nDuplicate sourceUrl groups found: ${dupeGroups.length}`);
  console.log('(Each group = 2+ Sale rows sharing the identical sourceUrl -- confirmed this');
  console.log(' session, on every group spot-checked, to be same-scrape-run duplication, not');
  console.log(' two distinct real listings that happen to share a URL.)');

  const results = {
    clean: [] as any[],
    needsReassign: [] as any[],
    manualReview: [] as any[],
  };

  // Collect ALL candidate ids across ALL groups up front so every FK relation is queried
  // ONCE via a batched groupBy, instead of once per row per relation (1,285 rows x 56
  // relations would be ~72,000 individual queries otherwise).
  const allGroups: { sourceUrl: string; rows: SaleRow[] }[] = [];
  for (const g of dupeGroups) {
    const sourceUrl = g.sourceUrl as string;
    const rows = (await prisma.sale.findMany({
      where: { sourceUrl },
      select: { id: true, title: true, sourceUrl: true, sourceName: true, status: true, lastScrapedAt: true, createdAt: true },
    })) as SaleRow[];
    allGroups.push({ sourceUrl, rows });
  }
  const allIds = allGroups.flatMap((g) => g.rows.map((r) => r.id));
  console.log(`Total candidate rows across all groups: ${allIds.length}`);

  console.log(`\nRunning ${SALE_FK_RELATIONS.length} batched relation counts (one query per relation, not per row)...`);
  const countsByRelation = new Map<string, Map<string, number>>();
  for (const rel of SALE_FK_RELATIONS) {
    const counts = await batchCountsByRelation(rel, allIds);
    countsByRelation.set(rel.model, counts);
  }

  for (const { sourceUrl, rows } of allGroups) {
    // Per-row engagement total across every TRACKED (RESTRICT/CASCADE/SETNULL) relation.
    // UNTRACKED relations are reported separately as ORPHAN_RISK, not folded into the
    // main engagement score, since they don't block or explain a delete either way --
    // they're a silent-data-loss risk regardless of which row is picked as survivor.
    const engagementTotals = new Map<string, number>();
    let anyCountFailed = false;
    for (const row of rows) {
      let total = 0;
      for (const rel of SALE_FK_RELATIONS) {
        if (rel.onDelete === 'UNTRACKED') continue;
        const c = countsByRelation.get(rel.model)?.get(row.id) ?? 0;
        if (c === -1) anyCountFailed = true;
        else total += c;
      }
      engagementTotals.set(row.id, total);
    }

    const survivor = pickSurvivor(rows, engagementTotals);
    const losers = rows.filter((r) => r.id !== survivor.id);

    const groupReport: any = {
      sourceUrl,
      sourceName: rows[0]?.sourceName,
      survivorId: survivor.id,
      survivorTitle: survivor.title,
      loserCount: losers.length,
      losers: [] as any[],
    };

    let groupIsClean = true;
    let groupNeedsFlag = anyCountFailed;

    for (const loser of losers) {
      const fkCounts: Record<string, number> = {};
      const orphanRisk: Record<string, number> = {};
      for (const rel of SALE_FK_RELATIONS) {
        const c = countsByRelation.get(rel.model)?.get(loser.id) ?? 0;
        if (c <= 0) continue;
        if (rel.onDelete === 'UNTRACKED') orphanRisk[rel.model] = c;
        else fkCounts[rel.model] = c;
      }

      const loserReport = {
        id: loser.id,
        title: loser.title,
        status: loser.status,
        createdAt: loser.createdAt,
        lastScrapedAt: loser.lastScrapedAt,
        fkCounts,
        orphanRisk,
      };
      groupReport.losers.push(loserReport);

      if (Object.keys(fkCounts).length > 0) groupIsClean = false;
      // A loser with real engagement AND that engagement is close to the survivor's
      // (within 2x) is ambiguous enough to warrant a human look rather than trusting
      // the tiebreak alone.
      const loserEng = engagementTotals.get(loser.id) ?? 0;
      const survivorEng = engagementTotals.get(survivor.id) ?? 0;
      if (loserEng > 0 && survivorEng > 0 && loserEng >= survivorEng / 2) {
        groupNeedsFlag = true;
      }
    }

    if (groupNeedsFlag) {
      results.manualReview.push(groupReport);
    } else if (groupIsClean) {
      results.clean.push(groupReport);
    } else {
      results.needsReassign.push(groupReport);
    }
  }

  const totalCleanLosers = results.clean.reduce((s, g) => s + g.loserCount, 0);
  const totalReassignLosers = results.needsReassign.reduce((s, g) => s + g.loserCount, 0);
  const totalManualLosers = results.manualReview.reduce((s: number, g: any) => s + g.loserCount, 0);

  console.log('\n' + '─'.repeat(78));
  console.log('SUMMARY');
  console.log('─'.repeat(78));
  console.log(`CLEAN groups (safe to delete loser rows outright): ${results.clean.length} groups, ${totalCleanLosers} loser rows`);
  console.log(`NEEDS_REASSIGN groups (FK rows must move first): ${results.needsReassign.length} groups, ${totalReassignLosers} loser rows`);
  console.log(`MANUAL_REVIEW groups (count failure / ambiguous engagement split): ${results.manualReview.length} groups, ${totalManualLosers} rows`);
  console.log(`\nTotal groups processed: ${dupeGroups.length} (should equal ${results.clean.length + results.needsReassign.length + results.manualReview.length})`);

  console.log('\nNEXT STEP (human-supervised, not part of this script):');
  console.log('  1. Review the CLEAN bucket first -- these losers have zero real engagement');
  console.log('     anywhere. A follow-up script would prisma.sale.delete() each loser id,');
  console.log('     one row at a time, logging before/after, inside a transaction.');
  console.log('  2. Review NEEDS_REASSIGN. For each loser, reassignment is:');
  console.log('     UPDATE "<Table>" SET "saleId" = <survivorId> WHERE "saleId" = <loserId>;');
  console.log('     for every table in that loser\'s fkCounts, THEN delete the loser row.');
  console.log('     Any orphanRisk entries need the SAME reassignment even though Postgres');
  console.log('     would not block the delete without it -- otherwise those rows silently');
  console.log('     point at a Sale id that no longer exists.');
  console.log('  3. MANUAL_REVIEW groups need a human look before either the survivor pick or');
  console.log('     the merge itself is trusted -- do not auto-resolve these.');
  console.log('  4. Only after cleanup: create the partial unique index from');
  console.log('     ADR-scraper-sale-dedup-race-condition-2026-09-27.md, then ship the');
  console.log('     ingestScrapedListing() P2002 catch-and-skip from the same ADR.');

  if (JSON_MODE) {
    console.log('\n' + JSON.stringify(results, null, 2));
  }
}

main()
  .catch((err) => {
    console.error('[dedupe-sales-dryrun] Fatal error:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
