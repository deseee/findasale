/**
 * ebayStoreSubscriptionService.ts — real eBay Store subscription tier + free-
 * insertion cap detection (2026-09-20, Patrick-requested "stop guessing" fix).
 *
 * Context: platformStatsService.ts's resolveEbayLimit() and
 * config/ebayInsertionLimits.ts's EBAY_FREE_INSERTIONS_CAP both used flat
 * guesses (250 for no store, 1000 for "any store detected") instead of
 * eBay's real, published, tier-dependent free-listing allotment -- Starter/
 * no-store 250, Basic 1,000, Premium 10,000, Anchor 25,000, Enterprise
 * 100,000/month (ebay.com/help/selling/fees-credits-invoices/store-selling-
 * fees-managed-payments-sellers?id=4809, confirmed 2026-09-20). This file
 * replaces the guess with a real per-organizer lookup via eBay's Account
 * API, cached on EbayConnection (migration 20260920010000).
 *
 * IMPORTANT -- zero eBay API calls from the forecast path: ADR ebay-renewal-
 * forecasting (2026-09-15) explicitly constrains ebayInsertionsForecast.ts /
 * ebayRenewalForecastCron.ts to make NO eBay API calls ("The forecast cron
 * and endpoint must not add new eBay API calls"). So the live eBay call here
 * (fetchAndCacheEbayStoreSubscription) is NEVER invoked from that path -- it
 * only runs:
 *   (1) at OAuth-connect time (ebayController.ts, same spot as the existing
 *       fetchAndStoreEbayPolicies), and
 *   (2) as an opportunistic piggyback inside ebayListingSyncCron.ts's
 *       pullSyncForOrganizer(), which already makes eBay API calls for that
 *       organizer every 4h regardless of this feature -- so this adds no new
 *       call to a job that wasn't already calling eBay for that organizer.
 * The forecast path only ever calls getCachedEbayFreeInsertionsCap(), a pure
 * DB read that falls back to the flat EBAY_FREE_INSERTIONS_CAP guess when
 * nothing has been cached yet (e.g. organizers connected before this file
 * existed, until the next OAuth reconnect or 4h sync cycle backfills them).
 *
 * KNOWN LIMITATION (disclosed, not silently assumed): eBay's docs also
 * describe an additional "select categories" bonus allotment on top of the
 * baseline numbers below, for certain niche categories. That bonus is not
 * modeled here -- unlikely to apply broadly to FindA.Sale's estate/yard-sale/
 * auction/flea-market secondhand inventory, and modeling it would need a
 * per-category eBay lookup this feature doesn't do. The baseline "all
 * categories" number is what's used.
 *
 * ALSO DISCLOSED: eBay's dev docs (JS-rendered, only partially readable from
 * this session) did not give a complete confirmed response schema for GET
 * /sell/account/v1/subscription. fetchAndCacheEbayStoreSubscription() below
 * handles a couple of plausible response shapes defensively and logs the raw
 * response keys on anything unrecognized, so the real shape gets confirmed
 * from the first live production call rather than guessed here. If the
 * field name turns out to be different, every organizer just keeps getting
 * the flat 250/1000 fallback (safe, not silently wrong) until this is
 * updated from that real evidence.
 */

import { prisma } from '../lib/prisma';
import { ebayProxyUrl, ebayProxyHeaders, ebayUserHeaders } from './ebayHttp';
import { EBAY_FREE_INSERTIONS_CAP } from '../config/ebayInsertionLimits';

// Re-check interval: a seller's store tier is a manual, infrequent upgrade
// decision, not something that drifts on its own -- no need to re-fetch on
// every cron cycle once cached. 7 days balances staleness against never
// hammering eBay's Account API for a value that almost never changes.
const RECHECK_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

// eBay's own published free (zero-insertion-fee) monthly allotment per store
// subscription level -- baseline "all categories" fixed-price number (see
// this file's header comment for the "select categories" bonus this does
// NOT model). Source: eBay's own Store selling fees page (id=4809) and Zero
// insertion fee listings page (id=4163), both confirmed 2026-09-20. eBay's
// API has historically returned "Featured" as the internal subscriptionLevel
// value for the tier marketed today as "Premium" -- both map to the same cap
// defensively.
const STORE_TIER_CAPS: Record<string, number> = {
  NONE: 250,
  STARTER: 250,
  BASIC: 1000,
  PREMIUM: 10000,
  FEATURED: 10000, // legacy/internal eBay API name for the Premium tier
  ANCHOR: 25000,
  ENTERPRISE: 100000,
};

/**
 * Maps eBay's raw subscriptionLevel string to our real free-insertion cap.
 * Unrecognized values fall back to the conservative EBAY_FREE_INSERTIONS_CAP
 * default (under-promising free capacity is safe; over-promising causes a
 * real eBay fee surprise) and are logged so a genuinely new tier name gets
 * noticed rather than silently mis-mapped.
 */
function capForStoreLevel(level: string | null | undefined): number {
  if (!level) return EBAY_FREE_INSERTIONS_CAP;
  const key = level.trim().toUpperCase();
  const cap = STORE_TIER_CAPS[key];
  if (cap === undefined) {
    console.warn(
      `[eBay Store Tier] Unrecognized subscriptionLevel "${level}" -- falling back to ${EBAY_FREE_INSERTIONS_CAP}. May be a new eBay tier name; update STORE_TIER_CAPS in ebayStoreSubscriptionService.ts.`
    );
    return EBAY_FREE_INSERTIONS_CAP;
  }
  return cap;
}

/**
 * Pure DB read -- zero eBay API calls, safe to call from the forecast path.
 * Returns the cached real cap when available, else the flat fallback guess.
 */
export async function getCachedEbayFreeInsertionsCap(
  organizerId: string
): Promise<{ cap: number; source: 'CACHED' | 'ESTIMATED'; storeLevel: string | null }> {
  const connection = await prisma.ebayConnection.findUnique({
    where: { organizerId },
    select: { freeInsertionsCap: true, storeSubscriptionLevel: true },
  });

  if (connection?.freeInsertionsCap != null) {
    return { cap: connection.freeInsertionsCap, source: 'CACHED', storeLevel: connection.storeSubscriptionLevel };
  }
  return { cap: EBAY_FREE_INSERTIONS_CAP, source: 'ESTIMATED', storeLevel: null };
}

/**
 * True when this organizer's cached store-tier lookup is missing or older
 * than RECHECK_INTERVAL_MS. Callers use this to decide whether to piggyback
 * a live refresh onto an eBay call they're already making for another reason.
 */
export function isEbayStoreSubscriptionStale(checkedAt: Date | null): boolean {
  if (!checkedAt) return true;
  return Date.now() - checkedAt.getTime() > RECHECK_INTERVAL_MS;
}

/**
 * Live lookup + cache. Fire-and-forget by design (mirrors
 * ebayController.ts's fetchAndStoreEbayPolicies): never throws, only logs.
 * Calls eBay's Account API GET /sell/account/v1/subscription using the
 * organizer's own OAuth token (the app already requests the sell.account
 * scope on every connect, per ebayController.ts's OAuth scope list).
 *
 * On any non-2xx response, or a network/parse error, this leaves the cached
 * value (or lack of one) completely untouched -- it never writes a guessed
 * number just because the live call failed. storeSubscriptionCheckedAt is
 * only updated on a genuine success, so isEbayStoreSubscriptionStale() keeps
 * returning true and the next opportunity (next OAuth reconnect, or next 4h
 * pull-sync cycle) retries automatically.
 */
export async function fetchAndCacheEbayStoreSubscription(organizerId: string, accessToken: string): Promise<void> {
  try {
    const res = await fetch(ebayProxyUrl('/sell/account/v1/subscription'), {
      method: 'GET',
      headers: {
        ...ebayUserHeaders(accessToken),
        ...ebayProxyHeaders(),
      },
    });

    if (!res.ok) {
      console.warn(
        `[eBay Store Tier] GET /subscription returned ${res.status} for organizer ${organizerId} -- leaving cached cap unchanged, will retry later`
      );
      return;
    }

    const data = (await res.json()) as any;
    // Defensive shape handling -- try the documented single-object shape
    // first, then a possible { subscriptions: [...] } collection shape.
    const rawLevel: string | undefined = data?.subscriptionLevel ?? data?.subscriptions?.[0]?.subscriptionLevel;

    if (rawLevel === undefined) {
      console.warn(
        `[eBay Store Tier] GET /subscription 200 response for organizer ${organizerId} had no recognizable subscriptionLevel field -- response keys: ${Object.keys(data ?? {}).join(', ')}. Treating as no store (250 cap) -- a genuine 200 with no subscription data is eBay's own signal that this seller has no store.`
      );
    }

    const cap = capForStoreLevel(rawLevel ?? null);

    await prisma.ebayConnection.update({
      where: { organizerId },
      data: {
        storeSubscriptionLevel: rawLevel ?? null,
        freeInsertionsCap: cap,
        storeSubscriptionCheckedAt: new Date(),
      },
    });

    console.log(`[eBay Store Tier] organizer ${organizerId}: subscriptionLevel=${rawLevel ?? '(none)'} -> freeInsertionsCap=${cap}`);
  } catch (error) {
    console.error(`[eBay Store Tier] Error fetching store subscription for organizer ${organizerId}:`, error);
  }
}
