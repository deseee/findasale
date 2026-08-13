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
 * the pre-ADR-102 routing scheme" isn't a condition it checks, and it never
 * will be (that job intentionally stamps an item current the moment its
 * computed amount stops drifting, which does nothing to fix a categorically
 * wrong policy TYPE that happens to still price close to the new amount).
 *
 * This sweep finds exactly those items -- live, weighted, currently pinned to
 * a policy that classifies as 'weight-tier' via classifyPolicy() among the
 * organizer's LIVE synced eBay policies -- and calls the existing
 * resyncItemShippingPolicy(itemId) (ebayController.ts, already used by
 * resyncShippingDriftSweep) to re-resolve them through the CURRENT
 * authoritative cascade (resolvePoliciesForItem) and re-pin only when the
 * resolved policy actually differs. One-time in nature (once every item has
 * been touched, the candidate set is permanently empty going forward -- new
 * pushes already land on the current cascade), but written as a resumable,
 * rate-limit-respecting sweep like resyncShippingDriftSweep since a single
 * organizer can have 50+ listings on one stale policy alone, easily exceeding
 * one day's eBay call budget.
 *
 * Deliberately NOT a cron job (unlike resyncShippingDriftSweep) -- this is a
 * one-time migration, not a recurring drift check. Call
 * backfillStaleWeightTierPoliciesSweep() directly (e.g. from a one-off script
 * or an internal trigger) until candidates hits 0.
 */
import { prisma } from '../index';
import { resyncItemShippingPolicy } from '../controllers/ebayController';
import { isEbayRateLimited, trackEbayCall } from '../lib/ebayRateLimiter';
import {
  refreshEbayAccessToken,
  ebayProxyUrl,
  ebayProxyHeaders,
  ebayUserHeaders,
} from '../services/ebayHttp';
import { classifyPolicy, EbayFulfillmentPolicySummary } from '../utils/ebayPolicyParser';

export interface BackfillStaleWeightTierExample {
  itemId: string;
  title: string;
  oldPolicyName: string;
  repinned: boolean;
}

export interface BackfillStaleWeightTierResult {
  /** Live, weighted items examined this sweep (before per-organizer policy classification). */
  itemsExamined: number;
  /** Distinct organizers whose live eBay policy list was fetched this sweep. */
  organizersExamined: number;
  /** Items found currently pinned to a policy that classifies as 'weight-tier' -- the actual backfill target set. */
  candidates: number;
  /** Items re-pinned to a new (different) policy via resyncItemShippingPolicy. In dryRun this counts would-be re-pins without calling it. */
  repinned: number;
  /** Candidates skipped (already resolved to the same policy, resync failed non-fatally, or organizer's policy list could not be fetched). */
  skipped: number;
  /** True if the eBay daily call budget ran out mid-sweep (loop short-circuited; re-run later to resume). */
  rateLimited: boolean;
  /** True if no eBay re-pin calls or local writes were performed (preview only; the policy-list fetch itself still happens, it is read-only). */
  dryRun: boolean;
  /** Up to 15 example item/policy pairs for handoff reporting. */
  examples: BackfillStaleWeightTierExample[];
}

/**
 * Fetch an organizer's LIVE synced eBay fulfillment policies (read-only, one
 * eBay call). Mirrors the identical inline fetcher already used inside
 * resyncItemShippingPolicy (ebayController.ts) -- kept as a local copy here
 * rather than exporting that controller's private helper, since it is a
 * small, self-contained read with no side effects.
 */
async function fetchLivePolicies(organizerId: string): Promise<EbayFulfillmentPolicySummary[]> {
  if (isEbayRateLimited()) return [];
  const accessToken = await refreshEbayAccessToken(organizerId);
  if (!accessToken) return [];
  try {
    const res = await fetch(
      ebayProxyUrl('/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US&limit=100'),
      { headers: { ...ebayUserHeaders(accessToken), ...ebayProxyHeaders() } }
    );
    if (!res.ok) return [];
    trackEbayCall();
    const data = (await res.json()) as any;
    return (data.fulfillmentPolicies || []) as EbayFulfillmentPolicySummary[];
  } catch (err) {
    console.warn(`[BackfillStaleWeightTier] fulfillment policy fetch failed for organizer=${organizerId}: ${(err as Error).message}`);
    return [];
  }
}

/**
 * Sweep live listings still pinned to a pre-ADR-102 weight-tier eBay policy
 * and re-pin them onto the current routing cascade.
 *
 * @param opts.limit        Max candidate items to examine (default 200).
 * @param opts.dryRun        When true, identify and count candidates (still fetches each
 *                            organizer's live policy list -- read-only) but performs no
 *                            re-pin calls and no writes.
 * @param opts.organizerId   Scope the sweep to a single organizer (e.g. the initial
 *                            ArtifactMI run). Omit to sweep all organizers with an
 *                            active EbayConnection, matching resyncShippingDriftSweep's
 *                            own all-organizers default.
 */
export async function backfillStaleWeightTierPoliciesSweep(opts?: {
  limit?: number;
  dryRun?: boolean;
  organizerId?: string;
}): Promise<BackfillStaleWeightTierResult> {
  const limit = opts?.limit ?? 200;
  const dryRun = opts?.dryRun ?? false;

  // Candidate items: live, weighted, not local-pickup-only, carrying a fulfillment
  // policy id -- same base gating resyncItemShippingPolicy itself enforces (it would
  // otherwise return 'not-live'/'no-weight'/'local-pickup' for these), checked here too
  // so the sweep doesn't burn eBay calls on items it already knows will be skipped.
  const items = await prisma.item.findMany({
    where: {
      ebayListingId: { not: null },
      ebayOfferId: { not: null },
      status: 'AVAILABLE',
      packageWeightOz: { gt: 0 },
      ebayFulfillmentPolicyId: { not: null },
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
  let organizersExamined = 0;
  let candidates = 0;
  let repinned = 0;
  let skipped = 0;
  let rateLimited = false;
  const examples: BackfillStaleWeightTierExample[] = [];

  // Group by organizer so the policy-list fetch happens once per organizer, not once per item.
  const byOrganizer = new Map<string, typeof items>();
  for (const item of items) {
    const organizerId = item.sale?.organizerId;
    if (!organizerId) continue;
    const bucket = byOrganizer.get(organizerId);
    if (bucket) bucket.push(item);
    else byOrganizer.set(organizerId, [item]);
  }

  outer: for (const [organizerId, orgItems] of byOrganizer) {
    if (isEbayRateLimited()) {
      rateLimited = true;
      break;
    }
    organizersExamined++;

    const policies = await fetchLivePolicies(organizerId);
    if (policies.length === 0) {
      // Couldn't fetch this organizer's live policies (no token, rate-limited, or
      // transient failure) -- can't classify, so skip without counting as a candidate.
      skipped += orgItems.length;
      continue;
    }

    const policyNameById = new Map(policies.map((p) => [p.fulfillmentPolicyId, p.name]));
    const weightTierPolicyIds = new Set(
      policies.filter((p) => classifyPolicy(p.name) === 'weight-tier').map((p) => p.fulfillmentPolicyId)
    );

    for (const item of orgItems) {
      const currentPolicyId = item.ebayFulfillmentPolicyId as string;
      if (!weightTierPolicyIds.has(currentPolicyId)) {
        skipped++;
        continue;
      }

      candidates++;
      const oldPolicyName = policyNameById.get(currentPolicyId) || currentPolicyId;

      if (dryRun) {
        if (examples.length < 15) {
          examples.push({ itemId: item.id, title: item.title, oldPolicyName, repinned: false });
        }
        continue;
      }

      if (isEbayRateLimited()) {
        rateLimited = true;
        break outer;
      }

      try {
        const res = await resyncItemShippingPolicy(item.id);
        if (res.changed) {
          repinned++;
          if (examples.length < 15) {
            examples.push({ itemId: item.id, title: item.title, oldPolicyName, repinned: true });
          }
        } else {
          skipped++;
        }
      } catch (err) {
        console.warn(`[BackfillStaleWeightTier] item ${item.id} failed (non-fatal): ${(err as Error).message}`);
        skipped++;
      }
    }
  }

  return { itemsExamined, organizersExamined, candidates, repinned, skipped, rateLimited, dryRun, examples };
}
