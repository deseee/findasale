# eBay Sync Full Audit — S590

**Date:** 2026-04-26
**Auditor:** Main session (orchestrator), code-only audit
**Scope:** Every code path that touches eBay, from auth through sync to display
**Status of audit:** Complete (code), partial (DB state — VM bash unavailable, deferred)

---

## TL;DR

S589 fixed **2 of ~35** eBay endpoints. Token + refresh now go through the Vercel proxy. **Everything else** — sold sync, ended-listings sync, OAuth callback (new connections), inventory push, policy fetch, taxonomy, notifications, disconnect — still calls `api.ebay.com` directly from Railway and will fail. Plus one separate pricing-fallback bug in the CSV export path that re-introduces the S466 $285→$169.09 override regression in a different code branch.

**Headline P0 issues:** 8.
**Total findings:** 13 (P0–P3).

---

## What S589 Actually Fixed (verified)

| Concern | Status | Evidence |
|---|---|---|
| Application token (client_credentials) | ✅ Proxied | `ebayController.ts:139-147` posts to `/api/proxy/ebay?action=token` |
| Per-organizer refresh token | ✅ Proxied | `ebayController.ts:718-729` posts to `/api/proxy/ebay?path=/identity/v1/oauth2/token` |
| eBay image proxy (incognito) | ✅ Live | `imageProxyController.ts` allowlists `i.ebayimg.com`, `ir.ebaystatic.com`, `thumbs.ebaystatic.com` and streams with 24h cache |
| Vercel proxy file present | ✅ Live | `frontend/pages/api/proxy/ebay.ts` deployed in commit `3c56a9bb` (Vercel READY 22:46 UTC) |

---

## What's Still Broken — by Endpoint

The Vercel proxy supports two modes (token, general path-forwarding). Backend code has not been migrated to use Mode 2. Every call below still hits `api.ebay.com` (or `svcs.ebay.com`/`apiz.ebay.com`) directly and will fail from Railway's egress.

### P0 — Critical (block core flows)

**1. Sold-item sync (`ebaySoldSyncCron.ts:117-126`)**
- Direct call: `https://api.ebay.com/sell/fulfillment/v1/order?...`
- Impact: every 15-minute sync cycle returns 0 orders. **No items can be marked SOLD by eBay sync.** This is the headline complaint.

**2. Ended-listings sync (`ebayController.ts:3263, 3469, 3934`)**
- Direct calls to `https://api.ebay.com/ws/api.dll` (Trading API XML).
- Impact: every 4-hour ended-listings sync fails. Items withdrawn or expired on eBay stay marked AVAILABLE on FindA.Sale forever. Inventory drift compounds over time.

**3. OAuth callback for new connections (`ebayController.ts:1297-1310`)**
- Direct call: `https://api.ebay.com/identity/v1/oauth2/token` to exchange `authorization_code` for tokens.
- Impact: **a new organizer cannot connect their eBay account.** This is an onboarding blocker. Existing connections still work because their refresh tokens go through the proxy (S589 fix).

**4. Identity API after OAuth (`ebayController.ts:1322`)**
- Direct call: `https://apiz.ebay.com/commerce/identity/v1/user/` (note: different host, `apiz`).
- Impact: even if OAuth succeeded, the display username falls back to JWT `sub` (internal numeric eBay user ID). Organizer sees a meaningless number instead of their eBay handle.

**5. Inventory API push (`ebayController.ts:1854, 1996, 2011, 2034, 2048, 2064, 2094, 2188, 2202, 2246`)**
- Direct calls: `https://api.ebay.com/sell/inventory/v1/inventory_item/...`, `/offer`, `/offer/{id}/publish`, `/offer/{id}/withdraw`.
- Impact: every "Push to eBay" action fails. The single most-marketed eBay feature does not work in production.

**6. Account policies fetch (`ebayController.ts:867, 873, 879, 973`)**
- Direct calls: `payment_policy`, `fulfillment_policy`, `return_policy`.
- Impact: Settings → eBay shows no policies. Push flow that requires policy IDs fails earlier than it would otherwise.

**7. Inventory locations (`ebayController.ts:1010, 2363, 2385, 2412`)**
- Direct calls: `/sell/inventory/v1/location` create/enable/list.
- Impact: location auto-provisioning during connect fails. Push fails subsequently because eBay requires `merchantLocationKey`.

**8. Notification subscription setup (`ebayNotificationSetup.ts:48, 70`, `ebayController.ts:1120, 1461`)**
- Direct calls: `/commerce/notification/v1/destination` and `/subscription/{id}` (DELETE on disconnect).
- Impact: real-time order webhooks never register. Disconnect leaks subscriptions on eBay's side.

### P1 — Significant (degrade features but don't fully block them)

**9. Taxonomy / category suggestions (`ebayController.ts:812, 2811`, `ebayTaxonomyService.ts:65, 125, 349`)**
- Direct calls: `/commerce/taxonomy/v1/category_tree/{id}/get_category_suggestions`, `/get_item_aspects_for_category`, `/commerce/catalog/v1_beta/product_summary/search`.
- Impact: category resolution falls back to the static `SECONDARY_CATEGORY_MAP` (5 entries) — the cause of historical 25021 "condition invalid for primary category" errors S463/S464 tried to fix.

**10. Item condition policies (`ebayController.ts:2673`)**
- Direct call: `/sell/metadata/v1/marketplace/EBAY_US/get_item_condition_policies`.
- Impact: `ensureConditionValidForCategory` falls back; pushes may hit category-condition mismatches.

**11. Finding API price comps (`ebayController.ts:253`)**
- Direct call: `https://svcs.ebay.com/services/search/FindingService/v1?...` (note: `svcs.ebay.com`, separate host — Vercel proxy currently only handles `api.ebay.com`).
- Impact: every "Get Price Comps" call returns mock data (`isMockData: true`). The AI Comp Tool advertised in roadmap row #229 is silently degraded.

**12. ebayTaxonomyController duplicate token-refresh (`ebayTaxonomyController.ts:46-53`)**
- Direct call: `https://api.ebay.com/identity/v1/oauth2/token`.
- Impact: this controller maintains its own duplicate refresh-token logic that bypasses both `getEbayAccessToken()` and `refreshEbayAccessToken()`. So any aspects/catalog/identifier-suggest call from this controller also fails.
- Root cause: code duplication. Should call `refreshEbayAccessToken(organizerId)` not roll its own.

### P2 — Recurring product bugs

**13. CSV export pricing fallback regression (`ebayController.ts:544-552`)**
- Code:
  ```ts
  // Determine price: use aiSuggestedPrice > estimatedValue > price > default
  let price = 0.99;
  if (item.aiSuggestedPrice) {
    price = Number(item.aiSuggestedPrice);
  } else if (item.estimatedValue) {
    price = Number(item.estimatedValue);
  } else if (item.price) {
    price = item.price;
  }
  ```
- Impact: this is the **same** $285→$169.09 bug Patrick documented in S466 (memory: `feedback_organizer_intent_wins.md`). It was fixed in `pushSaleToEbay` (line 1837 — `item.price` first) but the fix never propagated to the CSV export path. Any organizer who exports an eBay CSV gets the AI guess, not their real price.
- Comment on line 544 explicitly states the wrong order: `"aiSuggestedPrice > estimatedValue > price > default"` — confirming this isn't a mid-edit bug, it's the intended (broken) logic.

---

## Architectural Observations (not P-rated, but worth flagging)

**A1. Two pricing-fallback code paths.** `pushSaleToEbay` (line 1837) and `csvExport` (line 544) implement the same fallback chain in two places, with two different orderings. Rule belongs in a single helper. Risk: every future pricing-related fix has to be made twice.

**A2. Two cron jobs share the same eBay-connection query.** `ebaySoldSyncCron` and `ebayEndedListingsSyncCron` both filter on `organizer.sales.some.items.some.ebayListingId not null AND status AVAILABLE`. They run on different schedules (15min vs 4hr) but query identical organizer sets. Once both work, watch for compounded rate-limit pressure on organizers with many eBay listings.

**A3. Two token-refresh code paths.** `refreshEbayAccessToken` (ebayController.ts:681) and the inline refresh in `ebayTaxonomyController.ts:23-82` are duplicates. Consolidate.

**A4. `pricingEngine/adapters/ebay.ts` is a stub.** Lines 14-17 return `[]`. ADR-069's pluggable pricing engine has the eBay adapter unimplemented. Either delete it or wire it to `fetchEbayPriceComps` (which itself currently returns mock data because of #11).

**A5. Two-phase upsert dance for ORDER_CONFIRMATION subscription.** Application-token destination + per-organizer subscription. Once #8 is fixed, verify both legs come back online.

---

## Roadmap vs Reality Cross-Check

| Roadmap row | Claim | Reality |
|---|---|---|
| #25 Organizer Persistent Inventory (eBay Sync) | ⚠️ partial — "Pending Chrome QA full suite" | Worse than partial. **Sync, push, comps, OAuth-for-new-orgs all broken.** Status should be ❌ until proxy migration completes. |
| #229 AI Comp Tool | Shipped S375 ✅✅ | Returns mock data in production (Finding API direct call to `svcs.ebay.com`). User-visible label says `isMockData: true`. Functionally broken since at least the Railway move (S264). |
| #244 eBay Push (Inventory API) | Shipped Phase 2 | Direct calls — has not worked from Railway since the network block. Probably has not worked end-to-end since S264. |
| #250 Price Research Panel | Shipped S389 ✅✅ | Inherits #229's mock-data problem for the eBay comp portion. |
| #292–#295 Live Taxonomy picker, ebayNeedsReview | Shipped S463–S464 ✅ Chrome-verified | Picker UI works because it uses cached/stored category names. Live API search at picker-render time would fail (#9). Depends on whether the picker hits the API or only displays cached data. |
| #326 Comparable Sale Tiles | Shipped S557 — Pending Chrome QA | Backed by `ItemCompLookup` cache. Works for cached items. New items requiring fresh comp fetch fall through to mock data via #11. |

**Bottom line:** roadmap presents eBay integration as ~70% shipped. Functional reality from Railway's egress is closer to ~10% (token + image proxy work; basically nothing else does).

---

## Database Audit — DEFERRED

Cannot run psycopg2 queries against Railway from this session — VM bash environment failed to start. The following queries should run next session before the fix dispatch:

```sql
-- Active eBay connections + token age
SELECT organizerId, ebayUserId, connectedAt, lastRefreshedAt,
       lastEbaySoldSyncAt, lastErrorAt, lastErrorMessage
FROM "EbayConnection"
ORDER BY connectedAt DESC;

-- Items with stale ebayListingId (last sync > 30 days OR null)
SELECT i.id, i.title, i.status, i.ebayListingId, i.listedOnEbayAt,
       s.organizerId
FROM "Item" i
JOIN "Sale" s ON i.saleId = s.id
WHERE i.ebayListingId IS NOT NULL
  AND i.status = 'AVAILABLE'
  AND (i.listedOnEbayAt IS NULL OR i.listedOnEbayAt < NOW() - INTERVAL '30 days')
ORDER BY i.listedOnEbayAt ASC NULLS FIRST
LIMIT 50;

-- ItemCompLookup with mock-data signature (price=45 exactly is the mock fallback)
SELECT itemId, ebayPrice, source, fallbackTier, fetchedAt
FROM "ItemCompLookup"
WHERE ebayPrice = 45 AND fallbackTier = 4
ORDER BY fetchedAt DESC
LIMIT 50;

-- Organizers connected but never synced
SELECT c.organizerId, o.name, c.connectedAt, c.lastEbaySoldSyncAt
FROM "EbayConnection" c
JOIN "Organizer" o ON c.organizerId = o.id
WHERE c.lastEbaySoldSyncAt IS NULL OR c.lastErrorAt IS NOT NULL;
```

---

## Prioritized Fix Plan

**Do not dispatch fixes until Patrick reviews this audit.** Once approved, these are the dispatch batches in order. Each batch is one parallel `general-purpose` agent dispatch with the relevant findasale-dev context.

### Batch A — P0 Core Loops (single agent, ~4 files, sequential)
Goal: get sold sync, ended sync, and OAuth working again.
Files:
- `ebaySoldSyncCron.ts:117` — proxy the order fetch
- `ebayController.ts:3263, 3469, 3934` — proxy the Trading API calls (XML POST through proxy Mode 2; verify proxy passes raw body for non-JSON content-type)
- `ebayController.ts:1297` — proxy the OAuth `authorization_code` exchange (Mode 2 with form-encoded body)
- `ebayController.ts:1322` — proxy the Identity API call (note: different host `apiz.ebay.com` — Vercel proxy currently only forwards to `api.ebay.com`; **proxy code itself needs an update** to support `apiz` as well, or add a separate `?host=apiz` parameter)

**Pre-dispatch task:** decide whether to extend `frontend/pages/api/proxy/ebay.ts` to support `apiz.ebay.com` and `svcs.ebay.com` hosts, OR add two more proxy routes (`/api/proxy/ebay-svcs`, `/api/proxy/ebay-apiz`). Architect decision required.

### Batch B — P0 Push & Policies (single agent, 1 file, ~10 edits)
Goal: get "Push to eBay" working end-to-end.
File: `ebayController.ts`
- Lines 867, 873, 879, 973 (account policies)
- Lines 1010, 2363, 2385, 2412 (locations)
- Lines 1120, 1461, 1463 (notifications + disconnect)
- Lines 1854, 1996, 2011, 2034, 2048, 2064, 2094, 2188, 2202, 2246 (inventory + offer + publish + withdraw)

All can be wrapped in a single helper `proxiedEbayFetch(path, init)` that prepends the proxy URL and adds `X-Proxy-Secret`. This collapses ~20 edits into one helper plus call-site replacements.

### Batch C — P0 Notification Setup (1 file)
- `ebayNotificationSetup.ts:48, 70` — same proxiedEbayFetch helper.

### Batch D — P1 Taxonomy (2 files)
- `ebayController.ts:812, 2811`
- `ebayTaxonomyService.ts:65, 125, 349`
- `ebayTaxonomyController.ts:46` — **delete the duplicate token-refresh; call `refreshEbayAccessToken(organizerId)` instead.**

### Batch E — P1 Finding API (1 file, but blocked on proxy host support)
- `ebayController.ts:253` (`svcs.ebay.com`).
- Blocked until Batch A pre-dispatch decision lands (host-support extension to proxy).

### Batch F — P2 CSV Pricing Fix (1 file, 1 small edit)
- `ebayController.ts:544-552` — invert order to match `pushSaleToEbay` (`item.price` first).
- **Better:** extract a single `resolveEbayPrice(item)` helper used by both the CSV export path and `pushSaleToEbay`. Prevents future drift (architectural observation A1).

### Batch G — Cleanup
- Delete or implement `pricingEngine/adapters/ebay.ts` stub (A4).
- Add an integration test that catches "direct api.ebay.com URL in any backend file under packages/backend/src/" — a simple grep test in CI would have prevented this entire class of bug.

---

## Definition of Done

This audit is complete. The eBay integration is **NOT** done until:
1. All P0 batches A–C land and Chrome QA confirms a fresh sync cycle marks at least one item SOLD with no Railway log errors.
2. A new test organizer (Karen or fresh seed) can connect their eBay account end-to-end without error.
3. Roadmap row #25 status updated to ✅ shipped (not ⚠️ partial) with Chrome QA evidence.
4. CI grep guard added against `api.ebay.com|svcs.ebay.com|apiz.ebay.com` literals in `packages/backend/`.

---

## Outstanding Decision for Patrick

**Multi-host proxy strategy.** Vercel proxy currently only handles `api.ebay.com`. Two of the affected endpoints use other eBay hosts (`svcs.ebay.com` for Finding API, `apiz.ebay.com` for Identity API). Three options:

1. **Extend the existing proxy** with a `?host=` query param (`api`, `svcs`, `apiz`). Smallest change. Slightly less safe (broader proxy surface).
2. **Add two more proxy routes** (`ebay-svcs.ts`, `ebay-apiz.ts`). Cleaner separation. Three files to maintain.
3. **Drop support for Finding API and Identity API.** Finding API is being deprecated by eBay; we could migrate to the Browse API (which is on `api.ebay.com` — already proxied). Identity API can be dropped if we accept `sub` claim as the user identifier (current fallback).

Recommendation: Option 1 short-term (unblock fixes), Option 3 medium-term (Finding API will die anyway).
