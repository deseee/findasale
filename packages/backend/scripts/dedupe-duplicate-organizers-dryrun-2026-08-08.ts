#!/usr/bin/env node
/**
 * dedupe-duplicate-organizers-dryrun-2026-08-08.ts
 *
 * DRY-RUN ONLY. This script NEVER writes to the database — no .update(), .delete(),
 * .deleteMany(), .updateMany(), or transaction call appears anywhere in this file.
 * It only reads (.findMany / .count / .groupBy) and PRINTS a report of what a real
 * merge-and-delete pass would need to do. Executing the actual merge is a separate,
 * human-supervised step (see "NEXT STEP" at the bottom of the report) — do not wire
 * this into a cron or CI step.
 *
 * WHY THIS EXISTS (context, S1215-era session, 2026-08-08):
 * Railway Postgres audit found 118,785 Organizer rows, of which an earlier same-session
 * DB query found 12,485 are duplicate rows across 3,156 distinct WEBSITE domains — created
 * because the scraper ingestion path (getOrCreateScrapedOrganizer, packages/backend/src/
 * services/scraper/index.ts) created a NEW Organizer row on every re-scrape instead of
 * upserting. That ingestion bug was fixed the same session by adding an esnOrgId-based
 * lookup branch (index.ts ~line 610) BEFORE the weaker dedupeKey/name+city fallbacks.
 * NEW duplicates should stop accumulating; the EXISTING 12,485 rows are untouched by that
 * fix and are what this script investigates.
 *
 * CRITICAL SAFETY NOTE — why this script does NOT group by website domain:
 * The scraper's own code comment (index.ts, directly above the esnOrgId branch) explains
 * why website/domain is an UNSAFE merge signal: "franchise networks that share one website
 * across many independently-run locations (e.g. grasons.com -- 15+ distinct Grasons
 * franchise Organizer rows, same website, different owners) each have their OWN distinct
 * esnOrgId per location." In other words, the 12,485-rows-across-3,156-domains figure
 * almost certainly INCLUDES real franchise siblings that must never be merged — merging
 * on domain alone would combine distinct businesses (distinct owners, distinct Stripe
 * Connect accounts, distinct sales) into one Organizer row. That would be a data-integrity
 * incident, not a cleanup.
 *
 * The only signals this script treats as "safe to auto-merge" are the ones that are
 * @unique-or-should-be per real-world location AND are confirmed (by the same code
 * comment, reasoned through explicitly before this fix shipped) to NOT collide across
 * franchise siblings:
 *   - esnOrgId       (EstateSales.NET's own per-location company ID — NOT globally unique
 *                      in the DB today, @@index only, which is exactly why duplicates can
 *                      exist on it; but each real-world location gets its own value)
 *   - googlePlaceId, foursquareVenueId, hereBusinessId (all @unique in schema.prisma —
 *      duplicates literally cannot exist on these already, included here only so the
 *      report is honest about why they contribute zero groups)
 *
 * businessName+city (dedupeKey) and website domain are explicitly EXCLUDED as merge
 * signals in this script — they are reported separately, read-only, as "needs manual
 * review" context, never as auto-mergeable.
 *
 * FK BLAST RADIUS (why this is a report, not a delete script):
 * schema.prisma was read in full for every model with an `organizerId` (or `ownerId` for
 * OrganizerWorkspace) foreign key into Organizer.id. There are 28 such models. Three use
 * onDelete: Restrict (Sale, SaleHub, TreasureTrail) — Postgres will hard-reject a delete
 * of an Organizer row that still has any of those children, so those must be reassigned
 * first or the delete simply fails (safe, but this script surfaces it up front instead of
 * letting a future executor discover it via a thrown error). Two use onDelete: SetNull
 * (Review, Testimonial) — deleting silently nulls their organizerId, which is fine
 * data-integrity-wise but loses the association. The remaining ~23 use onDelete: Cascade —
 * deleting a duplicate Organizer row SILENTLY DELETES every Sale-adjacent-but-not-Sale
 * child row it owns (OrganizerHours, EbayConnection, POSSession, ClaimRequest, etc.). If
 * any of those duplicate rows have real data in them (not just scraper stubs), a naive
 * `DELETE FROM "Organizer" WHERE id IN (...)` would destroy it. This script counts every
 * one of those 28 relations per candidate "loser" row before recommending anything.
 *
 * Each duplicate Organizer also has a paired 1:1 stub User row (scraped orgs are created
 * via a nested `prisma.user.create({ data: { organizer: { create: {...} } } })`. Deleting
 * the Organizer does not touch its User (the FK direction is Organizer.userId -> User,
 * Cascade only fires User-down-to-Organizer, not the reverse) — so this script also counts
 * the paired User's own real-activity tables (Purchase, Bid, Favorite, PointsTransaction,
 * Review, Conversation-as-shopper) to confirm the "these are inert scraper stubs" assumption
 * rather than asserting it.
 *
 * OUTPUT: three buckets per esnOrgId-duplicate-group:
 *   CLEAN          — every non-survivor row has zero rows in all 28 FK tables AND its
 *                     paired User has zero rows in all checked User-activity tables.
 *                     Reported as "safe to delete outright" with an estimated byte reclaim.
 *   NEEDS_REASSIGN — has FK rows to move first. Lists exact table+count+the reassignment
 *                     statement a human-supervised executor would run (UPDATE ... SET
 *                     organizerId = <survivor> WHERE organizerId = <loser>), not executed.
 *   MANUAL_REVIEW  — the group contains a CLAIMED organizer (isClaimed=true / real user
 *                     activity), or more than one row in the group is claimed, or Sale rows
 *                     exist on more than one row in the group (ambiguous which is authoritative).
 *                     Never auto-merge a claimed account into another without Patrick's
 *                     explicit sign-off — see CLAUDE.md Removal/high-risk-subset gates.
 *
 * Usage (read-only — safe to run any time, but per project rule this agent did NOT run it):
 *   DATABASE_URL=... npx ts-node packages/backend/scripts/dedupe-duplicate-organizers-dryrun-2026-08-08.ts
 *   DATABASE_URL=... npx ts-node packages/backend/scripts/dedupe-duplicate-organizers-dryrun-2026-08-08.ts --json > report.json
 */

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const JSON_MODE = process.argv.includes('--json');

// ── FK relation map: every model with a FK into Organizer.id, and its onDelete behavior.
// Derived by reading packages/database/prisma/schema.prisma in full (grep "organizerId"
// / "ownerId" occurrences, then confirming the owning model + onDelete clause for each).
// prismaField = the field name on the Organizer relation used by the Prisma client at
// prisma.<prismaField>.count({ where: { organizerId: <id> } }).
interface FkRelation {
  model: string; // Prisma client accessor, e.g. prisma.sale
  onDelete: 'RESTRICT' | 'CASCADE' | 'SETNULL';
  fkField: string; // the column name on the child table
}

const ORGANIZER_FK_RELATIONS: FkRelation[] = [
  // RESTRICT — Postgres refuses the delete outright while these exist.
  { model: 'sale', onDelete: 'RESTRICT', fkField: 'organizerId' },
  { model: 'saleHub', onDelete: 'RESTRICT', fkField: 'organizerId' },
  { model: 'treasureTrail', onDelete: 'RESTRICT', fkField: 'organizerId' },
  // SETNULL — delete succeeds, association silently nulled.
  { model: 'review', onDelete: 'SETNULL', fkField: 'organizerId' },
  { model: 'testimonial', onDelete: 'SETNULL', fkField: 'organizerId' },
  // CASCADE — delete succeeds, ALL of these child rows are silently destroyed too.
  { model: 'organizerHours', onDelete: 'CASCADE', fkField: 'organizerId' },
  { model: 'organizerBroadcast', onDelete: 'CASCADE', fkField: 'organizerId' },
  { model: 'ebayConnection', onDelete: 'CASCADE', fkField: 'organizerId' },
  { model: 'ebayPolicyMapping', onDelete: 'CASCADE', fkField: 'organizerId' },
  { model: 'conversation', onDelete: 'CASCADE', fkField: 'organizerId' },
  { model: 'follow', onDelete: 'CASCADE', fkField: 'organizerId' },
  { model: 'shopifyListing', onDelete: 'CASCADE', fkField: 'organizerId' },
  { model: 'organizerHoldSettings', onDelete: 'CASCADE', fkField: 'organizerId' },
  { model: 'saleTemplate', onDelete: 'CASCADE', fkField: 'organizerId' },
  { model: 'priceOverrideLog', onDelete: 'CASCADE', fkField: 'organizerId' },
  { model: 'smartFollow', onDelete: 'CASCADE', fkField: 'organizerId' },
  { model: 'workspaceMember', onDelete: 'CASCADE', fkField: 'organizerId' },
  { model: 'saleDonation', onDelete: 'CASCADE', fkField: 'organizerId' },
  { model: 'pOSSession', onDelete: 'CASCADE', fkField: 'organizerId' },
  { model: 'pOSPaymentLink', onDelete: 'CASCADE', fkField: 'organizerId' },
  { model: 'workspaceChatMessage', onDelete: 'CASCADE', fkField: 'organizerId' },
  { model: 'organizerScore', onDelete: 'CASCADE', fkField: 'organizerId' },
  { model: 'markdownCycle', onDelete: 'CASCADE', fkField: 'organizerId' },
  { model: 'directoryClaimEmail', onDelete: 'CASCADE', fkField: 'organizerId' },
  { model: 'claimRequest', onDelete: 'CASCADE', fkField: 'organizerId' },
  { model: 'shopperOrganizerIntroduction', onDelete: 'CASCADE', fkField: 'organizerId' },
  { model: 'outreachAuditLog', onDelete: 'CASCADE', fkField: 'organizerId' },
  { model: 'messageAutosendLog', onDelete: 'CASCADE', fkField: 'organizerId' },
  { model: 'organizerWorkspace', onDelete: 'CASCADE', fkField: 'ownerId' },
];

// User-side activity tables to check on the paired stub User row before assuming it's
// inert. If any of these are non-zero, the group is NOT clean and must go to manual review
// — a scraper stub is never supposed to have real shopper activity, but "supposed to" is
// exactly the kind of assumption this project's rules forbid; we count it instead.
const USER_ACTIVITY_RELATIONS: FkRelation[] = [
  { model: 'purchase', onDelete: 'CASCADE', fkField: 'userId' },
  { model: 'bid', onDelete: 'CASCADE', fkField: 'userId' },
  { model: 'favorite', onDelete: 'CASCADE', fkField: 'userId' },
  { model: 'pointsTransaction', onDelete: 'CASCADE', fkField: 'userId' },
  { model: 'review', onDelete: 'CASCADE', fkField: 'authorId' }, // Review.authorId, not organizerId
];

// Rough avg bytes/row (table+indexes) derived from the live storage audit context supplied
// this session: Organizer 196MB / 118,785 rows; User 89MB / 117,985 rows. Used only to
// produce an ESTIMATED reclaim figure in the report — not re-measured live (no DB access
// from this script's author in this pass; safe to trust because it is only illustrative,
// never used to decide what to delete).
const AVG_BYTES_PER_ORGANIZER_ROW = Math.round((196 * 1024 * 1024) / 118785); // ~1,730 B
const AVG_BYTES_PER_USER_ROW = Math.round((89 * 1024 * 1024) / 117985); // ~791 B

interface OrganizerRow {
  id: string;
  userId: string;
  businessName: string;
  esnOrgId: number | null;
  isClaimed: boolean;
  isUnmanagedListing: boolean;
  sourceCount: number;
  corroborationScore: Prisma.Decimal;
  createdAt: Date;
  website: string | null;
}

async function countFkRows(relations: FkRelation[], idValue: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const rel of relations) {
    try {
      // @ts-ignore — dynamic model access by design; every model name above was verified
      // against schema.prisma before being added to the map.
      const c = await (prisma as any)[rel.model].count({ where: { [rel.fkField]: idValue } });
      counts[rel.model] = c;
    } catch (err: any) {
      counts[rel.model] = -1; // sentinel: count failed, needs manual look (model name typo, etc.)
      console.error(`[dedupe-dryrun] count failed for ${rel.model}.${rel.fkField}=${idValue}: ${err?.message || err}`);
    }
  }
  return counts;
}

function pickSurvivor(group: OrganizerRow[]): OrganizerRow {
  // Prefer a claimed row (should never happen inside an esnOrgId group of scraper-created
  // rows, but if it does, that row is authoritative and must survive).
  const claimed = group.filter((g) => g.isClaimed);
  if (claimed.length === 1) return claimed[0];
  // Otherwise prefer highest corroborationScore, then highest sourceCount, then oldest.
  return [...group].sort((a, b) => {
    const scoreDiff = Number(b.corroborationScore) - Number(a.corroborationScore);
    if (scoreDiff !== 0) return scoreDiff;
    const srcDiff = b.sourceCount - a.sourceCount;
    if (srcDiff !== 0) return srcDiff;
    return a.createdAt.getTime() - b.createdAt.getTime();
  })[0];
}

async function main() {
  console.log('='.repeat(78));
  console.log('DUPLICATE ORGANIZER DRY-RUN REPORT — 2026-08-08 — NO WRITES PERFORMED');
  console.log('='.repeat(78));

  // ── Phase A: safe-signal duplicate groups (esnOrgId only — see header for why). ──────
  const esnGroups = await prisma.organizer.groupBy({
    by: ['esnOrgId'],
    where: { esnOrgId: { not: null } },
    _count: { esnOrgId: true },
    having: { esnOrgId: { _count: { gt: 1 } } },
  });

  console.log(`\nPhase A — esnOrgId duplicate groups found: ${esnGroups.length}`);
  console.log('(Each group = 2+ Organizer rows sharing the same EstateSales.NET company ID —');
  console.log(' the one signal confirmed in scraper/index.ts to NOT collide across franchise');
  console.log(' siblings. This is the ONLY set this script proposes auto-merging.)');

  const results = {
    clean: [] as any[],
    needsReassign: [] as any[],
    manualReview: [] as any[],
  };

  for (const g of esnGroups) {
    const esnOrgId = g.esnOrgId as number;
    const group = (await prisma.organizer.findMany({
      where: { esnOrgId },
      select: {
        id: true,
        userId: true,
        businessName: true,
        esnOrgId: true,
        isClaimed: true,
        isUnmanagedListing: true,
        sourceCount: true,
        corroborationScore: true,
        createdAt: true,
        website: true,
      },
    })) as unknown as OrganizerRow[];

    const claimedCount = group.filter((r) => r.isClaimed).length;

    // Ambiguous-authority guard: more than one claimed row in the same esnOrgId group is a
    // red flag (two different real accounts somehow share an ESN company ID) — never touch.
    if (claimedCount > 1) {
      results.manualReview.push({
        esnOrgId,
        reason: `${claimedCount} rows in this group are CLAIMED — ambiguous which is authoritative`,
        rows: group.map((r) => ({ id: r.id, businessName: r.businessName, isClaimed: r.isClaimed })),
      });
      continue;
    }

    const survivor = pickSurvivor(group);
    const losers = group.filter((r) => r.id !== survivor.id);

    const groupReport: any = {
      esnOrgId,
      survivorId: survivor.id,
      survivorBusinessName: survivor.businessName,
      loserCount: losers.length,
      losers: [] as any[],
    };

    let groupIsClean = true;
    let groupNeedsFlag = false;

    for (const loser of losers) {
      const fkCounts = await countFkRows(ORGANIZER_FK_RELATIONS, loser.id);
      const userActivityCounts = await countFkRows(USER_ACTIVITY_RELATIONS, loser.userId);

      const fkNonZero = Object.entries(fkCounts).filter(([, c]) => c > 0);
      const userNonZero = Object.entries(userActivityCounts).filter(([, c]) => c > 0);
      const anyCountFailed =
        Object.values(fkCounts).some((c) => c === -1) || Object.values(userActivityCounts).some((c) => c === -1);

      const loserReport = {
        id: loser.id,
        businessName: loser.businessName,
        userId: loser.userId,
        isClaimed: loser.isClaimed,
        createdAt: loser.createdAt,
        fkCounts: Object.fromEntries(fkNonZero),
        userActivityCounts: Object.fromEntries(userNonZero),
        estimatedReclaimBytes: AVG_BYTES_PER_ORGANIZER_ROW + AVG_BYTES_PER_USER_ROW,
      };
      groupReport.losers.push(loserReport);

      if (loser.isClaimed) {
        groupNeedsFlag = true; // a claimed org as a "loser" is never auto-mergeable
      } else if (anyCountFailed) {
        groupNeedsFlag = true;
      } else if (fkNonZero.length > 0 || userNonZero.length > 0) {
        groupIsClean = false;
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

  // ── Phase B: informational-only diagnostic on the website-domain grouping. ───────────
  // NOT a merge proposal. Confirms/quantifies the franchise-collision risk called out in
  // the header before anyone is tempted to use website domain as a merge key.
  const domainCandidates = await prisma.organizer.findMany({
    where: { isUnmanagedListing: true, website: { not: null } },
    select: { website: true, businessName: true, id: true },
  });
  const byDomain = new Map<string, { businessName: string; id: string }[]>();
  for (const o of domainCandidates) {
    let domain: string;
    try {
      domain = new URL(o.website!.startsWith('http') ? o.website! : `https://${o.website}`).hostname.replace(/^www\./, '');
    } catch {
      continue;
    }
    if (!byDomain.has(domain)) byDomain.set(domain, []);
    byDomain.get(domain)!.push({ businessName: o.businessName, id: o.id });
  }
  const domainDupeGroups = [...byDomain.entries()].filter(([, rows]) => rows.length > 1);
  const distinctNamesPerDomain = domainDupeGroups.map(
    ([domain, rows]) => [domain, new Set(rows.map((r) => r.businessName.trim().toLowerCase())).size, rows.length] as const
  );
  const likelyFranchisePattern = distinctNamesPerDomain.filter(([, distinctNames]) => distinctNames > 1);
  const likelySameBusinessPattern = distinctNamesPerDomain.filter(([, distinctNames]) => distinctNames === 1);

  console.log(`\nPhase B (diagnostic only, no merge proposed) — website-domain groups with 2+ rows: ${domainDupeGroups.length}`);
  console.log(
    `  - ${likelyFranchisePattern.length} domains have MULTIPLE DISTINCT business names sharing one site` +
      ` (franchise pattern, e.g. grasons.com — DO NOT merge on domain)`
  );
  console.log(
    `  - ${likelySameBusinessPattern.length} domains have rows all sharing the SAME business name` +
      ` (still not auto-merged by this script — no esnOrgId confirmation — but lower risk, worth a manual pass)`
  );

  // ── Report ────────────────────────────────────────────────────────────────────────
  const totalCleanLosers = results.clean.reduce((s, g) => s + g.loserCount, 0);
  const totalReassignLosers = results.needsReassign.reduce((s, g) => s + g.loserCount, 0);
  const totalManualLosers = results.manualReview.reduce((s: number, g: any) => s + (g.loserCount || g.rows?.length || 0), 0);
  const estimatedCleanReclaimBytes = totalCleanLosers * (AVG_BYTES_PER_ORGANIZER_ROW + AVG_BYTES_PER_USER_ROW);

  console.log('\n' + '─'.repeat(78));
  console.log('SUMMARY');
  console.log('─'.repeat(78));
  console.log(`CLEAN groups (safe to delete loser rows outright): ${results.clean.length} groups, ${totalCleanLosers} loser rows`);
  console.log(`  Estimated space reclaim if executed: ~${(estimatedCleanReclaimBytes / 1024).toFixed(1)} KB`);
  console.log(`NEEDS_REASSIGN groups (FK rows must move first): ${results.needsReassign.length} groups, ${totalReassignLosers} loser rows`);
  console.log(`MANUAL_REVIEW groups (claimed org involved / count failure / ambiguous): ${results.manualReview.length} groups, ${totalManualLosers} rows`);
  console.log('\nNOTE: these totals are a SUBSET of the previously-found 12,485 duplicate rows');
  console.log('(that figure was grouped by website domain, which Phase B shows is unsafe to');
  console.log('auto-merge on). The true safely-mergeable count is whatever this script found');
  console.log('via esnOrgId above — likely much smaller, because esnOrgId is only populated');
  console.log('for EstateSales.NET-sourced rows (grep confirms every other scraper source file');
  console.log('passes esnOrgId=undefined). The remaining duplicates need a different, still-safe');
  console.log('signal (e.g. googlePlaceId/foursquareVenueId/hereBusinessId backfill, or a human');
  console.log('per-domain review of the "same business name" Phase B bucket) before more of the');
  console.log('12,485 can be safely closed out.');

  console.log('\nNEXT STEP (human-supervised, not part of this script):');
  console.log('  1. Review the CLEAN bucket. If it looks right, a follow-up script executes');
  console.log('     prisma.organizer.delete + prisma.user.delete for each loser id, inside a');
  console.log('     transaction, one row at a time, logging before/after counts.');
  console.log('  2. Review NEEDS_REASSIGN. For each loser, the reassignment is:');
  console.log('     UPDATE "<Table>" SET "<fkField>" = <survivorId> WHERE "<fkField>" = <loserId>;');
  console.log('     for every table listed in that loser\'s fkCounts, THEN delete the loser row.');
  console.log('  3. MANUAL_REVIEW groups go to Patrick — do not auto-resolve claimed-account cases.');

  if (JSON_MODE) {
    console.log('\n' + JSON.stringify({ results, domainDiagnostic: { domainDupeGroups: domainDupeGroups.length, likelyFranchisePattern: likelyFranchisePattern.length, likelySameBusinessPattern: likelySameBusinessPattern.length } }, null, 2));
  }
}

main()
  .catch((err) => {
    console.error('[dedupe-dryrun] Fatal error:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
