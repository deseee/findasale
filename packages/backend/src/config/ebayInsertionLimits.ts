/**
 * ebayInsertionLimits.ts — Named constant for eBay's free-monthly-insertion cap.
 *
 * ADR ebay-renewal-forecasting (2026-09-15), Flagged Question #3 (formalized as a
 * required Dev Instruction by Patrick's 2026-09-15 decision): "250" previously
 * existed only as an inline literal (see platformStatsService.ts's resolveEbayLimit,
 * which independently hardcodes the same 250/1000 guess for the unrelated, already-
 * broken EbayLimitBar metric — not reused here on purpose, see below).
 *
 * STORE-TIER GAP RESOLVED (2026-09-20, ADR ebay-store-tier-cap, Patrick-requested
 * "stop guessing" fix): this used to be a flat 250 for every organizer regardless of
 * their real eBay Store subscription level (up to 100,000/mo for Enterprise stores).
 * That's now fixed by services/ebayStoreSubscriptionService.ts, which looks up each
 * organizer's real Store tier via eBay's Account API and caches their real cap on
 * EbayConnection.freeInsertionsCap. getCachedEbayFreeInsertionsCap() (in that same
 * file) is what ebayInsertionsForecast.ts actually calls now — this constant is no
 * longer the everyday value. It survives only as the last-resort fallback for an
 * organizer whose live lookup hasn't succeeded yet (never connected an eBay Store
 * lookup, or every attempt so far has failed) — see that file for the full design,
 * including why the live eBay call can't happen inside the forecast path itself.
 */
export const EBAY_FREE_INSERTIONS_CAP = 250;
