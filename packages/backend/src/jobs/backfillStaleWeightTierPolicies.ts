/**
 * backfillStaleWeightTierPolicies -- one-time backfill for the ADR-102 migration.
 *
 * ADR-102 (roadmap #622, 2026-08-10) replaced weight-tier/cubic-tier eBay
 * fulfillment-policy MATCHING (matchWeightTier/matchCubicTier in
 * ebayPolicyParser.ts -- now unused for routing, see resolvePoliciesForItem's
 * own comment at ebayController.ts ~line 4446) with a computed-flat-rate
 * cascade: ensureFvfFlatRatePolicy/ensureCalculatedPolicyWithHandling now
 * auto-provision/reuse "FindA.Sale Flat $X.XX" (or CALCULATED) policies per
 * item instead of matching to an organizer's hand-named weight-tier or
 * "GA Cubic" eBay policies.
 *
 * Items pushed BEFORE that date are still pinned to their original hand-named
 * weight-tier policy (e.g. "Ground Advantage Under 1lb $9.99") and never
 * self-heal: the only existing resync job, resyncShippingDriftSweep
 * (resyncShippingDrift.ts), only re-examines items whose stored
 * ebayRateVersion is stale relative to CARRIER RATE-TABLE changes -- "still on
 * the pre-ADR-102 routing scheme" isn't a condition it checks.
 *
 * DESIGN NOTE (2026-08-13, corrected after the first production dry run):
 * The original version of this sweep pre-filtered candidates by fetching each
 * organizer's live eBay fulfillment-policy list and classifying the item's
 * CURRENTLY STORED `ebayFulfillmentPolicyId` via classifyPolicy() -- only
 * items pinned to a policy that classified as 'weight-tier' were touched. A
 * live dry run against organizer Artifact (organizerId
 * cmnxueoas0005tfv8brnc0kky) returned candidates:0, which looked wrong given
 * eBay's own Business Policies page showed 60+ listings still on weight-tier
 * policies. Direct production DB reads (read-only) found the real cause: of
 * Artifact's 122 live eBay listings tracked in FindA.Sale, 80 have
 * `ebayFulfillmentPolicyId = NULL` -- the policy applied at push time was
 * simply never recorded back to FindA.Sale's DB. Of the 42 that DO have a
 * stored value, only 5 pointed at a weight-tier policy (all already SOLD).
 * The classification pre-filter can only ever see what FindA.Sale itself
 * recorded, so for this organizer (and likely others with the same gap) it
 * was blind to the majority of affected listings by design, not by bug.
 *
 * FIX: do not pre-classify anything. Call the existing
 * resyncItemShippingPolicy(itemId) (ebayController.ts, already used by
 * resyncShippingDriftSweep) unconditionally for every live, weighted,
 * non-local-pickup item -- including ones with a NULL stored policy id.
 * resyncItemShippingPolicy already resolves the CURRENT authoritative policy
 * via the live cascade (resolvePoliciesForItem) and only calls the eBay PUT +
 * writes to the DB when the resolved policy actually differs from what's
 * stored (`routing.fulfillmentPolicyId !== item.ebayFulfillmentPolicyId`) --
 * for a NULL stored value this is always true, so it naturally backfills the
 * missing data; for an item whose stored value already matches, it is a safe
 * no-op. This also removes the need to fetch/classify each organizer's live
 * policy list at all -- one fewer eBay call per organizer, and one fewer way
 * for this sweep to silently see nothing (do not reintroduce a
 * classifyPolicy()-based pre-filter here; it is what caused the false
 * candidates:0 result described above).
 *
 * One-time in nature (once every item has been touched, a re-run finds
 * nothing left to change), but written as a resumable, rate-limit-respecting
 * sweep like resyncShippingDriftSweep since a single organizer can have 100+
 * eligible listings, easily exceeding what's sensible in one call.
 *
 * Deliberately NOT a cron job (unlike resyncShippingDriftSweep) -- this is a
 * one-time migration, not a recurring drift check. Call
 * backfillStaleWeightTierPoliciesSweep() directly (e.g. via the internal
 * route in routes/internal.ts) until itemsExamined hits 0.
 */
import { prisma } from '../index';
import { resyncItemShippingPolicy } from '../controllers/ebayController';
import { isEbayRateLimited } from '../lib/ebayRateLimiter';

export interface BackfillStaleWeightTierExample {
  itemId: string;
  title: string;
  oldPolicyId: string | null;
  repinned: boolean;
}

export interface BackfillStaleWeightTierResult {
  /** Live, weighted, non-local-pickup items matching the base query this sweep (candidate pool). */
  itemsExamined: number;
  /** Distinct organizers represented among itemsExamined. */
  organizersExamined: number;
  /**
   * In a REAL run: same as itemsExamined (every matching item gets a real resyncItemShippingPolicy
   * attempt -- there is no pre-classification step anymore, see the file header for why). In a
   * DRY RUN: also itemsExamined -- this is a COUNT-ONLY preview. There is no cheap local recompute
   * available here (unlike resyncShippingDrift.ts's resolveItemShipping), so a dry run cannot predict
   * which of these items will actually change without calling resyncItemShippingPolicy itself, which
   * makes real eBay calls. Do not read `repinned` as meaningful in a dry run -- it is always 0.
   */
  candidates: number;
  /** Items resyncItemShippingPolicy actually re-pinned to a different policy. Always 0 in a dry run. */
  repinned: number;
  /** Items examined that resulted in no change (already correct) or a non-fatal per-item failure. Always 0 in a dry run. */
  skipped: number;
  /** True if the eBay daily call budget ran out mid-sweep (loop short-circuited; re-run later to resume). */
  rateLimited: boolean;
  /** True if no eBay calls or writes were performed (preview only -- itemsExamined/organizersExamined come from a DB read alone). */
  dryRun: boolean;
  /** Up to 15 example item results for handoff reporting. */
  examples: BackfillStaleWeightTierExample[];
}

/**
 * Sweep live listings for a stale or missing eBay fulfillment policy and
 * re-pin them onto the current routing cascade. See file header for the
 * 2026-08-13 design correction (no stored-field pre-filter).
 *
 * @param opts.limit        Max candidate items to examine (default 200).
 * @param opts.dryRun        When true, only counts candidates via a DB read -- makes
 *                            no eBay calls and no writes. See BackfillStaleWeightTierResult
 *                            doc comments: repinned/skipped are always 0 in a dry run.
 * @param opts.organizerId   Scope the sweep to a single organizer (e.g. the initial
 *                            Artifact run, organizerId cmnxueoas0005tfv8brnc0kky). Omit
 *                            to sweep every organizer with a matching item.
 */
export async function backfillStaleWeightTierPoliciesSweep(opts?: {
  limit?: number;
  dryRun?: boolean;
  organizerId?: string;
}): Promise<BackfillStaleWeightTierResult> {
  const limit = opts?.limit ?? 200;
  const dryRun = opts?.dryRun ?? false;

  // Candidate items: live, weighted, not local-pickup-only -- same base gating
  // resyncItemShippingPolicy itself enforces (it would otherwise return
  // 'not-live'/'no-weight'/'local-pickup' for these), checked here too so the sweep
  // doesn't spend a call on an item it already knows will be a no-op. Deliberately NOT
  // filtering on ebayFulfillmentPolicyId -- a NULL value is exactly one of the cases
  // this sweep exists to fix (see file header).
  const items = await prisma.item.findMany({
    where: {
      ebayListingId: { not: null },
      ebayOfferId: { not: null },
      status: 'AVAILABLE',
      packageWeightOz: { gt: 0 },
      OR: [{ ebayShippingOverride: null }, { ebayShippingOverride: { not: 'LOCAL_PICKUP_ONLY' } }],
      // Sale.organizerId is a required (non-nullable) scalar -- "any sale" needs no
      // filter at all here; items with no sale are excluded downstream in the loop below
      // (organizerId ?? skip), matching resyncShippingDrift.ts's own orphan-guard pattern.
      ...(opts?.organizerId ? { sale: { organizerId: opts.organizerId } } : {}),
    },
    take: limit,
    select: {
      id: true,
      title: true,
      ebayFulfillmentPolicyId: true,
      sale: { select: { organizerId: true } },
    },
  });

  const itemsExamined = items.length;
  const organizerIds = new Set<string>();
  for (const item of items) {
    if (item.sale?.organizerId) organizerIds.add(item.sale.organizerId);
  }
  const organizersExamined = organizerIds.size;

  const examples: BackfillStaleWeightTierExample[] = [];

  if (dryRun) {
    // Count-only preview -- no eBay calls, no writes. See result doc comments above.
    for (const item of items) {
      if (examples.length >= 15) break;
      examples.push({
        itemId: item.id,
        title: item.title,
        oldPolicyId: item.ebayFulfillmentPolicyId,
        repinned: false,
      });
    }
    return {
      itemsExamined,
      organizersExamined,
      candidates: itemsExamined,
      repinned: 0,
      skipped: 0,
      rateLimited: false,
      dryRun: true,
      examples,
    };
  }

  let repinned = 0;
  let skipped = 0;
  let rateLimited = false;

  for (const item of items) {
    if (isEbayRateLimited()) {
      rateLimited = true;
      break;
    }
    try {
      const res = await resyncItemShippingPolicy(item.id);
      if (res.changed) {
        repinned++;
        if (examples.length < 15) {
          examples.push({
            itemId: item.id,
            title: item.title,
            oldPolicyId: item.ebayFulfillmentPolicyId,
            repinned: true,
          });
        }
      } else {
        skipped++;
      }
    } catch (err) {
      console.warn(`[BackfillStaleWeightTier] item ${item.id} failed (non-fatal): ${(err as Error).message}`);
      skipped++;
    }
  }

  return {
    itemsExamined,
    organizersExamined,
    candidates: itemsExamined,
    repinned,
    skipped,
    rateLimited,
    dryRun: false,
    examples,
  };
}
