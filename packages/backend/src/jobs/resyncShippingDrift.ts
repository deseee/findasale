/**
 * ADR Shipping-Policy-Resync — Phase 3 / Part C: bulk re-pin on carrier-rate drift.
 *
 * When the carrier rate tables change (the *_RATE_EFFECTIVE_DATE constants move),
 * `currentEbayRateVersion()` returns a new version string. Live listings still carry
 * the OLD version in `Item.ebayRateVersion`. This sweep walks those drifted listings,
 * cheaply recomputes the buyer shipping amount locally (no eBay call), and only spends
 * an eBay re-pin call when the amount actually moved past the threshold (≥ $0.50 OR
 * ≥ 5%). Items that didn't drift are simply stamped with the current version + new
 * amount locally so they aren't re-examined next sweep. Once every live item carries
 * the current version, the sweep finds zero candidates and does nothing.
 *
 * Cost discipline:
 *   - The cheap local `resolveItemShipping` recompute GATES whether the eBay-calling
 *     `resyncItemShippingPolicy` runs at all.
 *   - `isEbayRateLimited()` short-circuits the loop the moment the daily budget is gone.
 *
 * Reuses (does NOT reimplement) Phase 1/2 exports:
 *   - resyncItemShippingPolicy(itemId)  — real eBay re-pin + column update (ebayController)
 *   - currentEbayRateVersion()          — combined carrier rate-version string (ebayController)
 *   - isEbayRateLimited()               — daily eBay call budget exhausted? (ebayRateLimiter)
 *   - resolveItemShipping(input)        — pure local recompute, no eBay calls (ebayShippingResolver)
 */
import cron from 'node-cron';
import { cronGuard } from '../utils/cronGuard';
import { prisma } from '../index';
import {
  resyncItemShippingPolicy,
  currentEbayRateVersion,
} from '../controllers/ebayController';
import { isEbayRateLimited } from '../lib/ebayRateLimiter';
import {
  resolveItemShipping,
  type ShippingResolverMapping,
} from '../services/ebayShippingResolver';

export interface ResyncShippingDriftResult {
  /** Live listings whose stored rate-version differed from current (examined this sweep). */
  candidates: number;
  /** Items re-pinned on eBay (or counted in dryRun) because their amount drifted. */
  repinned: number;
  /** Items examined that did NOT drift (stamped current locally, or re-pin reported no change). */
  checked: number;
  /** True if the eBay daily call budget ran out mid-sweep (loop short-circuited). */
  rateLimited: boolean;
  /** True if no eBay calls or local writes were performed (preview only). */
  dryRun: boolean;
  /** The carrier rate-version string in effect for this sweep. */
  version: string;
}

/** Re-pin threshold: amount must move ≥ $0.50 OR ≥ 5% to justify spending an eBay call. */
const DRIFT_ABS_CENTS = 50;
const DRIFT_PCT = 0.05;

/** Cached organizer + policy mapping (keyed by organizerId) to avoid refetch per item. */
interface OrgCacheEntry {
  lat: number | null;
  lng: number | null;
  mapping: ShippingResolverMapping | null;
}

/**
 * Sweep live listings whose stored rate-version is stale and re-pin those that drifted.
 *
 * @param opts.limit   Max candidate items to examine (default 100).
 * @param opts.dryRun  When true, count would-be re-pins but apply nothing (no eBay calls,
 *                      no local writes). Use to preview impact before a real sweep.
 */
export async function resyncShippingDriftSweep(opts?: {
  limit?: number;
  dryRun?: boolean;
}): Promise<ResyncShippingDriftResult> {
  const version = currentEbayRateVersion();
  const limit = opts?.limit ?? 100;
  const dryRun = opts?.dryRun ?? false;

  let candidates = 0;
  let repinned = 0;
  let checked = 0;
  let rateLimited = false;

  // Candidate items: live, available, and carrying a stale (or missing) rate-version.
  // Oldest/never-rated first so a budget-limited sweep makes progress on the staleset.
  const items = await prisma.item.findMany({
    where: {
      ebayListingId: { not: null },
      status: 'AVAILABLE',
      // Never auto-price weightless items (can't compute a real rate) or convert
      // local-pickup-only listings onto a shipping policy — leave those to the organizer.
      packageWeightOz: { gt: 0 },
      AND: [
        { OR: [{ ebayRateVersion: null }, { ebayRateVersion: { not: version } }] },
        { OR: [{ ebayShippingOverride: null }, { ebayShippingOverride: { not: 'LOCAL_PICKUP_ONLY' } }] },
      ],
    },
    take: limit,
    orderBy: [{ ebayShippingRatedAt: { sort: 'asc', nulls: 'first' } }],
    select: {
      id: true,
      packageWeightOz: true,
      packageLengthIn: true,
      packageWidthIn: true,
      packageHeightIn: true,
      ebayShippingOverride: true,
      ebayFulfillmentPolicyId: true,
      ebayShippingAmountCents: true,
      ebayShippingRatedAt: true,
      ebayRateVersion: true,
      sale: {
        select: {
          zip: true,
          organizerId: true,
        },
      },
    },
  });

  candidates = items.length;

  // Per-organizer cache so we fetch the mapping once even across many of their items.
  const orgCache = new Map<string, OrgCacheEntry | null>();

  for (const item of items) {
    // Stop spending eBay calls the moment the budget is gone — but only the eBay-calling
    // path costs budget. We still break here so we don't queue up more candidates than
    // the budget can serve; the next scheduled sweep resumes from the oldest unrated.
    if (isEbayRateLimited()) {
      rateLimited = true;
      break;
    }

    try {
      const organizerId = item.sale?.organizerId ?? null;
      if (!organizerId) {
        // Orphaned item with no sale/organizer — can't resolve; skip without counting drift.
        checked++;
        continue;
      }

      // Resolve organizer + mapping from cache (one DB hit per organizer per sweep).
      let org = orgCache.get(organizerId);
      if (org === undefined) {
        const organizer = await prisma.organizer.findUnique({
          where: { id: organizerId },
          include: { ebayPolicyMapping: true },
        });
        org = organizer
          ? {
              lat: organizer.lat ?? null,
              lng: organizer.lng ?? null,
              mapping: organizer.ebayPolicyMapping
                ? {
                    shippingMode: organizer.ebayPolicyMapping.shippingMode,
                    freeShippingOptIn: organizer.ebayPolicyMapping.freeShippingOptIn,
                    weightTierMappings: organizer.ebayPolicyMapping.weightTierMappings,
                  }
                : null,
            }
          : null;
        orgCache.set(organizerId, org);
      }
      if (!org) {
        checked++;
        continue;
      }

      // CHEAP LOCAL RECOMPUTE — no eBay call. CRITICAL: fromZip comes from the SALE origin,
      // never the organizer lat/lng (which are frequently null). This zone-from-sale-zip
      // bug already bit us once; do not "simplify" it away.
      const r = await resolveItemShipping({
        organizer: { lat: org.lat, lng: org.lng },
        mapping: org.mapping,
        item: {
          packageWeightOz: item.packageWeightOz,
          packageLengthIn: item.packageLengthIn != null ? Number(item.packageLengthIn) : null,
          packageWidthIn: item.packageWidthIn != null ? Number(item.packageWidthIn) : null,
          packageHeightIn: item.packageHeightIn != null ? Number(item.packageHeightIn) : null,
          ebayShippingOverride: item.ebayShippingOverride,
        },
        fromZip: item.sale?.zip ?? null,
      });

      const newCents = r.buyerAmountCents;
      const stored = item.ebayShippingAmountCents;

      const drift =
        stored == null ||
        Math.abs(newCents - stored) >= DRIFT_ABS_CENTS ||
        (stored > 0 && Math.abs(newCents - stored) / stored >= DRIFT_PCT);

      if (drift) {
        if (dryRun) {
          // Preview: count the would-be re-pin, touch nothing.
          repinned++;
        } else {
          // Real re-pin: this is the eBay-calling path. It updates all stored columns
          // (ebayFulfillmentPolicyId/AmountCents/RatedAt/RateVersion) itself.
          const res = await resyncItemShippingPolicy(item.id);
          if (res.changed) {
            repinned++;
          } else {
            // No live change needed (policy id already matched, or non-fatal skip).
            checked++;
          }
        }
      } else {
        // No meaningful drift. Stamp the item current locally (NO eBay call) so it drops
        // out of the candidate set next sweep. Skip writes entirely in dryRun.
        if (!dryRun) {
          await prisma.item.update({
            where: { id: item.id },
            data: {
              ebayRateVersion: version,
              ebayShippingAmountCents: newCents,
              ebayShippingRatedAt: new Date(),
            },
          });
        }
        checked++;
      }
    } catch (err) {
      // One bad item must never abort the whole sweep.
      console.warn(
        `[ResyncShippingDrift] item ${item.id} failed (non-fatal):`,
        (err as Error).message
      );
      checked++;
    }
  }

  return { candidates, repinned, checked, rateLimited, dryRun, version };
}

/**
 * Register the daily rate-drift sweep cron (4 AM UTC — low traffic).
 * Mirrors the node-cron + cronGuard pattern used by the other jobs in this directory.
 */
export const scheduleResyncShippingDriftCron = (): void => {
  cron.schedule(
    '0 4 * * *',
    cronGuard({ jobName: 'resyncShippingDriftCron' }, async () => {
      console.log('[ResyncShippingDrift] Starting daily carrier-rate drift sweep...');
      try {
        const summary = await resyncShippingDriftSweep({ limit: 200 });
        console.log('[ResyncShippingDrift] Sweep complete:', JSON.stringify(summary));
      } catch (err) {
        console.error('[ResyncShippingDrift] Sweep failed:', (err as Error).message);
      }
    })
  );
};
