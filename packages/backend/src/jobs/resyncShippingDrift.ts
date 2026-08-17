/**
 * ADR Shipping-Policy-Resync — Phase 3 / Part C: bulk re-pin on carrier-rate drift.
 *
 * When the carrier rate tables change (the *_RATE_EFFECTIVE_DATE constants move),
 * `currentEbayRateVersion()` returns a new version string. Live listings still carry
 * the OLD version in `Item.ebayRateVersion`. This sweep walks those drifted listings,
 * cheaply recomputes the buyer shipping amount locally (no eBay call), and only spends
 * an eBay re-pin call when the amount actually moved past the threshold (≥ $0.50 OR
 * ≥ 5%) -- or, for a name-priced source (NAME_PRICED_SOURCES below), by ANY amount at
 * all, because for those the amount is literally the eBay policy's name. Items that
 * didn't drift are simply stamped with the current version + new amount locally so they
 * aren't re-examined next sweep. Once every live item carries
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
  type ShippingResolutionSource,
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

/**
 * Resolution sources whose eBay POLICY IDENTITY is the buyer amount -- i.e. the policy
 * this item sits on is looked up / provisioned BY A NAME THAT EMBEDS THAT EXACT AMOUNT.
 * For `fvf-flat` that name is `FindA.Sale Flat $X.XX`
 * (ebayShippingResolver.ts's fvfFlat(); ebayFlatRatePolicyService.ts's
 * POLICY_NAME_PREFIX + findExistingFlatRatePolicy's exact-name match).
 *
 * Why this needs its own gate (bug found 2026-08-16): the ≥$0.50 / ≥5% thresholds above
 * exist to avoid spending an eBay call on an economically meaningless price move. That
 * reasoning does NOT hold for these sources, because for them even a ONE-CENT move is not
 * a price move at all -- it is a DIFFERENT POLICY OBJECT. When charm pricing shipped
 * (applyCharmPricing, utils/shippingPriceMath.ts, 2026-08-14) every generated name shifted
 * by a cent: $10.00 -> $9.99, $14.00 -> $13.99. ensureFvfFlatRatePolicy then created brand
 * new "$9.99"/"$13.99" policies while every already-live listing stayed pinned to the old
 * "$10.00"/"$14.00" policy -- and this sweep would never re-pin them, because 1 cent
 * clears neither threshold. Measured on the live Artifact account 2026-08-16 (direct read
 * of GET /sell/account/v1/fulfillment_policy + the Item table): 15 live listings still on
 * "FindA.Sale Flat $10.00", 6 on "$14.00", 2 on "$21.00", 2 on "$28.00", 1 each on
 * "$22.00"/"$30.00"/"$62.50" -- alongside separately-created charm-correct
 * "$13.99"/"$18.99"/"$19.99"/"$24.99" policies for newer pushes. Two distinct policy
 * generations for the same price point, permanently.
 *
 * There is a second, latent hazard in the no-drift branch below: it stamps the RECOMPUTED
 * amount into ebayShippingAmountCents without an eBay call, so a sub-threshold mismatch
 * would make the row read "in sync at $9.99" while the live listing still charges $10.00.
 * That has not fired on the current data (stored cents still match the live policy exactly)
 * only because those items already carry the current rate version and are never re-examined.
 * Treating a name-priced mismatch as drift closes both the stale-pin and the phantom-stamp.
 *
 * So: for these sources, ANY difference between the recomputed amount and the stored
 * amount is drift by definition. The eBay call is still cheap-gated overall -- an item
 * whose recomputed amount matches exactly is stamped locally with no eBay call, and
 * resyncItemShippingPolicy itself no-ops (reason `already-current`) if the resolved policy
 * id turns out to already match.
 */
const NAME_PRICED_SOURCES: ReadonlySet<ShippingResolutionSource> = new Set<ShippingResolutionSource>([
  'fvf-flat',
]);

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
      // (2026-08-17) Needed so this cheap local recompute applies the SAME item-level
      // fulfillment-policy override that resyncItemShippingPolicy (ebayController.ts:4709)
      // already passes. Omitting it made the two disagree on every override item and
      // produced a PERMANENT daily eBay call that could never converge -- see the note
      // above the resolveItemShipping call below.
      ebayFulfillmentPolicyOverrideId: true,
      ebayFulfillmentPolicyId: true,
      ebayShippingAmountCents: true,
      ebayShippingRatedAt: true,
      ebayRateVersion: true,
      // ADR-102 (roadmap #622): needed so the local recompute matches oddball-item
      // classification/category overrides instead of only the computed rate.
      ebayShippingClassification: true,
      ebayCategoryId: true,
      // ADR-103 Phase 4: needed so the local recompute applies the same AHS/oversize
      // packaging trigger the live listing-push path uses (resolvePoliciesForItem).
      packageType: true,
      // Needed so the local recompute can evaluate eBay Standard Envelope eligibility
      // (requires the item's price), same as the live listing-push path.
      price: true,
      // (2026-08-14) Needed so this cheap local recompute applies the SAME UNKNOWN-
      // classification gate ebayController.ts's resolvePoliciesForItem / resyncItemShippingPolicy
      // now use -- otherwise this sweep's drift comparison could disagree with what the real
      // re-pin call would do for an item whose weight/dims exist but were never organizer-confirmed.
      packageConfirmedByOrganizer: true,
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
                    // ADR-102 (roadmap #622): oddball-item overrides, so this cron's local
                    // recompute doesn't flag drift for items that are supposed to differ.
                    categoryOverrides: organizer.ebayPolicyMapping.categoryOverrides,
                    heavyOversizedPolicyId: organizer.ebayPolicyMapping.heavyOversizedPolicyId,
                    fragilePolicyId: organizer.ebayPolicyMapping.fragilePolicyId,
                    unknownPolicyId: organizer.ebayPolicyMapping.unknownPolicyId,
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
          // (2026-08-17) resolveItemShipping rule 2 (ebayShippingResolver.ts:192)
          // short-circuits on this field. resyncItemShippingPolicy passes it and this cron
          // did not, so for an override item the cron computed a real carrier rate while the
          // resync it triggered resolved to the override and wrote back buyerAmountCents = 0.
          // stored(0) vs recomputed(non-zero) re-tripped the drift test on the NEXT sweep,
          // forever: one wasted eBay call per override item per day, no convergence possible.
          // Confirmed on live data 2026-08-17 -- item cmo3eu1fs0071jqsuty6i4ylj had
          // ebayShippingAmountCents = 0 with ebayShippingRatedAt stamped by that morning's
          // 04:09 UTC sweep, while its stored policy never changed. With the field passed,
          // an override item resolves to source 'custom-override' (buyerAmountCents 0) on
          // BOTH sides, drift is false, and it is stamped locally with no eBay call.
          ebayFulfillmentPolicyOverrideId: item.ebayFulfillmentPolicyOverrideId,
          ebayShippingClassification: item.ebayShippingClassification,
          ebayCategoryId: item.ebayCategoryId,
          packageType: item.packageType,
          price: item.price ?? null,
          packageConfirmedByOrganizer: item.packageConfirmedByOrganizer,
        },
        fromZip: item.sale?.zip ?? null,
      });

      // ── OVERRIDE ADEQUACY WARNING (2026-08-17) ──────────────────────────────────────
      // An item-level policy override is honored verbatim and forever: nothing in the
      // engine has ever checked whether the policy it points at still covers the label.
      // That is how a retired preset kept under-recovering on a live listing with no
      // signal anywhere (BQ row "FEDEX GUITAR $34.99", eBay policy 308295966011).
      //
      // Now that override items converge (see above) they would otherwise become
      // permanently INVISIBLE to this sweep, so the visibility is restored here rather
      // than lost: re-resolve the SAME item with the override removed to obtain what the
      // engine would charge on its own. Pure local recompute -- no eBay call, no policy
      // fetch, no budget -- and it runs only for the handful of items carrying an override
      // (2 of 153 items in production on 2026-08-17). It NEVER changes what is stored or
      // pinned; it only logs, so an under-covered or retired override surfaces in the daily
      // sweep instead of silently costing the organizer money on every sale.
      if (r.source === 'custom-override' && item.ebayFulfillmentPolicyOverrideId) {
        try {
          const unOverridden = await resolveItemShipping({
            organizer: { lat: org.lat, lng: org.lng },
            mapping: org.mapping,
            item: {
              packageWeightOz: item.packageWeightOz,
              packageLengthIn: item.packageLengthIn != null ? Number(item.packageLengthIn) : null,
              packageWidthIn: item.packageWidthIn != null ? Number(item.packageWidthIn) : null,
              packageHeightIn: item.packageHeightIn != null ? Number(item.packageHeightIn) : null,
              ebayShippingOverride: item.ebayShippingOverride,
              ebayFulfillmentPolicyOverrideId: null, // the whole point of this second pass
              ebayShippingClassification: item.ebayShippingClassification,
              ebayCategoryId: item.ebayCategoryId,
              packageType: item.packageType,
              price: item.price ?? null,
              packageConfirmedByOrganizer: item.packageConfirmedByOrganizer,
            },
            fromZip: item.sale?.zip ?? null,
          });
          if (unOverridden.source !== 'hard-blocked' && unOverridden.buyerAmountCents > 0) {
            console.warn(
              `[ResyncShippingDrift] item ${item.id} sits on OVERRIDE policy ` +
                `${item.ebayFulfillmentPolicyOverrideId} -- the engine would charge ` +
                `$${(unOverridden.buyerAmountCents / 100).toFixed(2)} (source=${unOverridden.source}) ` +
                `for this package. Not changed (an override is the organizer's explicit choice); ` +
                `logged so an under-covered or retired override is visible.`
            );
          }
        } catch (adequacyErr) {
          // Diagnostics must never affect the sweep.
          console.warn(
            `[ResyncShippingDrift] item ${item.id} override-adequacy check failed (non-fatal):`,
            (adequacyErr as Error).message
          );
        }
      }

      // ADR-103 Phase 4: an item that exceeds every carrier's absolute max resolves to
      // source 'hard-blocked' with buyerAmountCents=0 -- that 0 is NOT a real computed
      // rate and must never be written as this item's stored shipping amount (would
      // silently look like free/underpriced shipping on next read). Skip it; the live
      // listing-push path's own resolvePoliciesForItem already soft-blocks and flags
      // items like this for review independently.
      if (r.source === 'hard-blocked') {
        console.warn(`[ResyncShippingDrift] item ${item.id} hard-blocked (non-fatal, skipped): ${r.hardBlockReason}`);
        checked++;
        continue;
      }

      // (roadmap #624) The item genuinely qualifies for eBay's Standard Envelope program,
      // but this cheap local recompute deliberately has no eBay policy list to match
      // against (no eBay call in this cron), so `r.buyerAmountCents` is the FindA.Sale
      // flat FALLBACK -- not necessarily what the live listing charges, which may sit on
      // the organizer's own envelope policy at a different price. Comparing the two would
      // report drift on every run and re-pin the item forever. Skip: the listing-push /
      // resync path resolves these correctly (with a real policy fetcher) when the item is
      // next pushed or re-synced.
      if (r.standardEnvelopeUnmatched) {
        console.log(`[ResyncShippingDrift] item ${item.id} standard-envelope-eligible — skipped (local recompute cannot match the organizer's real envelope policy)`);
        checked++;
        continue;
      }

      const newCents = r.buyerAmountCents;
      const stored = item.ebayShippingAmountCents;

      // A name-priced source (see NAME_PRICED_SOURCES) drifts on ANY cent difference:
      // the amount IS the policy name, so a 1-cent move means the live listing is pinned
      // to a different eBay policy object than the one we would resolve today.
      const nameIdentityDrift =
        stored != null && newCents !== stored && NAME_PRICED_SOURCES.has(r.source);

      // ── RESOLVED-POLICY IDENTITY DRIFT (2026-08-17) ──────────────────────────────
      // This sweep has only ever compared AMOUNTS. That is the right test for the
      // computed sources, which do not know their policy id here (fvf-flat and
      // calculated both return fulfillmentPolicyId: null -- provisioning needs an eBay
      // call this cron deliberately does not make), and it MUST stay the only test for
      // them: comparing a null id against a stored id would mark every ordinary item as
      // drifted and spend an eBay call on all of them, every sweep.
      //
      // But the override sources (item-level policy override, HEAVY_OVERSIZED / FRAGILE,
      // category override, UNKNOWN safety policy) DO return a real resolved policy id,
      // and they all return buyerAmountCents = 0. For those, the amount test can never
      // fire -- stored 0 vs recomputed 0 -- so an item pinned on eBay to a DIFFERENT
      // policy than the one we would resolve today was invisible and stayed wrong
      // forever. This is also what makes the override convergence added above safe:
      // without this check, an organizer re-binding an item to a corrected preset would
      // update the database and the live eBay listing would never be re-pinned, because
      // the item is no longer an amount-drift candidate.
      // Guarded on `!= null` so the computed paths are completely unaffected.
      const resolvedPolicyIdentityDrift =
        r.fulfillmentPolicyId != null && r.fulfillmentPolicyId !== item.ebayFulfillmentPolicyId;

      const drift =
        stored == null ||
        nameIdentityDrift ||
        resolvedPolicyIdentityDrift ||
        Math.abs(newCents - stored) >= DRIFT_ABS_CENTS ||
        (stored > 0 && Math.abs(newCents - stored) / stored >= DRIFT_PCT);

      if (resolvedPolicyIdentityDrift) {
        console.log(
          `[ResyncShippingDrift] item ${item.id} resolved-policy drift: stored policy ` +
            `${item.ebayFulfillmentPolicyId ?? '(none)'} vs resolved ${r.fulfillmentPolicyId} ` +
            `(source=${r.source}) -- re-pinning`
        );
      }

      if (nameIdentityDrift) {
        console.log(
          `[ResyncShippingDrift] item ${item.id} policy-name drift: stored=${stored} recomputed=${newCents} source=${r.source} name="${r.policyName ?? ''}" — re-pinning (sub-threshold amount, different policy)`
        );
      }

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
    '9 4 * * *', // staggered off pricingEngineCircuitBreakerRecovery's 0 4 * * * 2026-08-04 cost-optimization batch
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
