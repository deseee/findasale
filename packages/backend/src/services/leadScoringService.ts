/**
 * Lead Scoring Service — ADR-076 Phase 2
 *
 * Scores scraped organizers 0–100 and assigns a leadTier:
 *   COLD (0–24) — minimal data, cold outreach only
 *   WARM (25–49) — some signals, worth nurturing
 *   HOT  (50–74) — strong signals, prioritize outreach
 *   ENTERPRISE (75–100) — licensed, verified, multi-source, high-value
 *
 * Scoring dimensions (max 100 pts total):
 *   Contact completeness  — 40 pts  (email=25, phone=15)
 *   Corroboration depth   — 20 pts  (sourceCount + corroborationScore)
 *   Licensing             — 25 pts  (isStateLicensed + licenseNumber)
 *   Review strength       — 10 pts  (googleRatingCount tiers — grows as enrichment arrives)
 *   Physical presence     —  5 pts  (hasPhysicalOffice + googlePlaceId)
 *
 * Backfill: scores all existing organizers in batches of 200.
 * Weekly cron: re-scores all organizers every Sunday at 2 AM UTC.
 */

import { prisma } from '../lib/prisma';

// ─── Non-resale blocklist ─────────────────────────────────────────────────────

/**
 * Lowercase substrings that strongly indicate a non-resale business.
 * Any organizer whose businessName matches one of these will have
 * suppressOutreach set to true during lead scoring backfill.
 */
export const BUSINESS_NAME_BLOCKLIST: string[] = [
  // Security / alarm
  'alarm',
  'security system',
  'surveillance',

  // IT / consulting
  'computer consultant',
  'it consultant',
  'technology consultant',

  // Trades / construction
  'contractor',
  'construction',
  'roofing',
  'gutter',
  'siding',
  'plumbing',
  'electrical',
  'hvac',

  // Telecom
  'wireless',
  'telecom',
  'cellular',

  // Home improvement (non-resale)
  'tile',
  'flooring',
  'countertop',

  // Medical / healthcare
  'dental',
  'medical',
  'healthcare',
  'physician',

  // Real estate (excluding estate sale orgs)
  'real estate agent',
  'real estate broker',
  'real estate company',
  'real estate group',
  'real estate team',
  'real estate office',
  'realty',

  // Insurance
  'insurance agent',
  'insurance broker',

  // Auto dealerships
  'auto dealer',
  'car dealer',
  'vehicle dealer',
  'auto sales',
  'car sales',

  // Grocery / pharmacy
  'grocery',
  'supermarket',
  'pharmacy',
];

/**
 * Returns true if the business name contains any substring from the blocklist.
 * Case-insensitive. Safe to call with null/undefined — returns false.
 */
export function matchesNonResaleBlocklist(businessName: string | null | undefined): boolean {
  if (!businessName) return false;
  const lower = businessName.toLowerCase();
  return BUSINESS_NAME_BLOCKLIST.some((term) => lower.includes(term));
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type LeadTier = 'COLD' | 'WARM' | 'HOT' | 'ENTERPRISE';

export interface LeadScoreResult {
  score: number;
  tier: LeadTier;
  breakdown: {
    contactReachability: number;
    corroborationDepth: number;
    licensing: number;
    reviewStrength: number;
    physicalPresence: number;
  };
}

// Minimal organizer shape needed for scoring — avoids loading full model
interface ScoringInput {
  contactEmail: string | null;
  scrapedEmail: string | null;
  phone: string | null;
  sourceCount: number;
  corroborationScore: { toNumber(): number } | number | null;
  isStateLicensed: boolean | null;
  licenseNumber: string | null;
  googleRatingCount: number | null;
  hasPhysicalOffice: boolean | null;
  googlePlaceId: string | null;
}

// ─── Scoring algorithm ────────────────────────────────────────────────────────

/**
 * Calculate a lead score for a single organizer.
 * Pure function — no DB calls. Pass the organizer fields directly.
 */
export function calculateLeadScore(org: ScoringInput): LeadScoreResult {
  let contactReachability = 0;
  let corroborationDepth = 0;
  let licensing = 0;
  let reviewStrength = 0;
  let physicalPresence = 0;

  // ── 1. Contact completeness (max 40) ──────────────────────────────────────
  // Email is the primary outreach signal (+25), phone is a strong bonus (+15)
  if (org.contactEmail || org.scrapedEmail) contactReachability += 25;
  if (org.phone) contactReachability += 15;

  // ── 2. Corroboration depth (max 20) ───────────────────────────────────────
  // sourceCount tiers: 1→5, 2→10, 3→14, 4+→18
  // High corroborationScore (≥0.8) adds a final +2 quality bonus
  const sc = org.sourceCount ?? 1;
  if (sc >= 4) corroborationDepth = 18;
  else if (sc === 3) corroborationDepth = 14;
  else if (sc === 2) corroborationDepth = 10;
  else corroborationDepth = 5;

  const corrScore =
    org.corroborationScore === null || org.corroborationScore === undefined
      ? 0.5
      : typeof org.corroborationScore === 'number'
      ? org.corroborationScore
      : org.corroborationScore.toNumber();

  if (corrScore >= 0.8) corroborationDepth = Math.min(20, corroborationDepth + 2);

  // ── 3. Licensing (max 25) ─────────────────────────────────────────────────
  // State-licensed is the strongest professional signal (+20).
  // Having a license number without isStateLicensed flag also earns +5.
  if (org.isStateLicensed) {
    licensing += 20;
    if (org.licenseNumber) licensing += 5; // fully documented
  } else if (org.licenseNumber) {
    licensing += 5; // partial licensing data
  }

  // ── 4. Review strength (max 10) ───────────────────────────────────────────
  // googleRatingCount tiers: 1-4→3, 5-9→6, 10-24→8, 25+→10
  // Capped at 10 — we don't have Google data yet, grows as enrichment arrives
  const rc = org.googleRatingCount ?? 0;
  if (rc >= 25) reviewStrength = 10;
  else if (rc >= 10) reviewStrength = 8;
  else if (rc >= 5) reviewStrength = 6;
  else if (rc >= 1) reviewStrength = 3;

  // ── 5. Physical presence (max 5) ──────────────────────────────────────────
  // Confirmed physical office (+3) and verified Google Business profile (+2)
  // Capped at 5 — we don't have Google Places data yet
  if (org.hasPhysicalOffice) physicalPresence += 3;
  if (org.googlePlaceId) physicalPresence += 2;

  // ── Total & tier ──────────────────────────────────────────────────────────
  const score = Math.min(
    100,
    contactReachability + corroborationDepth + licensing + reviewStrength + physicalPresence
  );

  const tier: LeadTier =
    score >= 75 ? 'ENTERPRISE' :
    score >= 50 ? 'HOT' :
    score >= 25 ? 'WARM' : 'COLD';

  return {
    score,
    tier,
    breakdown: {
      contactReachability,
      corroborationDepth,
      licensing,
      reviewStrength,
      physicalPresence,
    },
  };
}

// ─── Backfill ─────────────────────────────────────────────────────────────────

const BATCH_SIZE = 200;

export interface BackfillStats {
  total: number;
  scored: number;
  cold: number;
  warm: number;
  hot: number;
  enterprise: number;
  suppressed: number;
  durationMs: number;
}

/**
 * Score all organizers in the database.
 * Processes in batches of 200 to avoid memory pressure.
 * Safe to run multiple times — always overwrites leadScore/leadTier/lastScoredAt.
 */
export async function runLeadScoringBackfill(): Promise<BackfillStats> {
  const startTime = Date.now();
  const now = new Date();

  const stats: BackfillStats = {
    total: 0,
    scored: 0,
    cold: 0,
    warm: 0,
    hot: 0,
    enterprise: 0,
    suppressed: 0,
    durationMs: 0,
  };

  // Scope to unmanaged/unclaimed listings only — paying organizers are not outreach targets
  const unmanagedWhere = {
    OR: [
      { isClaimed: false },
      { isUnmanagedListing: true },
    ],
  } as const;

  // Count unmanaged organizers upfront for logging
  stats.total = await prisma.organizer.count({ where: unmanagedWhere });
  console.log(`[leadScoring] Starting backfill for ${stats.total} unmanaged organizers (batch size: ${BATCH_SIZE})`);

  let cursor: string | undefined = undefined;
  let batchNum = 0;

  while (true) {
    batchNum++;

    const batch = await prisma.organizer.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      where: unmanagedWhere,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        businessName: true,
        suppressOutreach: true,
        contactEmail: true,
        scrapedEmail: true,
        phone: true,
        sourceCount: true,
        corroborationScore: true,
        isStateLicensed: true,
        licenseNumber: true,
        googleRatingCount: true,
        hasPhysicalOffice: true,
        googlePlaceId: true,
      },
    });

    if (batch.length === 0) break;

    cursor = batch[batch.length - 1].id;

    // Score all organizers in this batch; flag non-resale names for suppression
    const updates = batch.map((org) => {
      const { score, tier } = calculateLeadScore(org);
      const blocklisted = matchesNonResaleBlocklist(org.businessName);
      const shouldSuppress = org.suppressOutreach || blocklisted;
      if (blocklisted) {
        console.log(`[LeadScoring] Suppressed: ${org.businessName} (matched blocklist)`);
      }
      return { id: org.id, score, tier, shouldSuppress };
    });

    // Write in parallel — each update is small
    await Promise.all(
      updates.map(({ id, score, tier, shouldSuppress }) =>
        prisma.organizer.update({
          where: { id },
          data: {
            leadScore: score,
            leadTier: tier,
            lastScoredAt: now,
            suppressOutreach: shouldSuppress,
          },
        })
      )
    );

    // Accumulate tier stats
    for (const { tier, shouldSuppress } of updates) {
      stats.scored++;
      if (tier === 'COLD') stats.cold++;
      else if (tier === 'WARM') stats.warm++;
      else if (tier === 'HOT') stats.hot++;
      else if (tier === 'ENTERPRISE') stats.enterprise++;
      if (shouldSuppress) stats.suppressed++;
    }

    console.log(
      `[leadScoring] Batch ${batchNum}: scored ${batch.length} organizers ` +
      `(${stats.scored}/${stats.total} total)`
    );

    if (batch.length < BATCH_SIZE) break;

    // Yield between batches to avoid starving live site queries
    await new Promise(r => setTimeout(r, 50));
  }

  stats.durationMs = Date.now() - startTime;

  console.log(
    `[leadScoring] Backfill complete in ${stats.durationMs}ms — ` +
    `${stats.scored} scored: ` +
    `COLD=${stats.cold} WARM=${stats.warm} HOT=${stats.hot} ENTERPRISE=${stats.enterprise} ` +
    `SUPPRESSED=${stats.suppressed}`
  );

  return stats;
}
